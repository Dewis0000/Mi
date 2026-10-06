<?php
/** Сетка сеансов, цены (тарифы/деление/опции/предоплата), валидация и брони. */
declare(strict_types=1);

const DAY_SEC = 86400;
const ACTIVE_STATUSES = ['NEW', 'CONFIRMED'];

// ------------------------------------------------------------------ квесты
function quests_all(): array { return data_all()['quests']; }
function quest_by_id(?string $id): ?array {
    foreach (quests_all() as $q) if ($q['id'] === $id || $q['slug'] === $id) return $q;
    return null;
}
function active_quest($id): array {
    $q = quest_by_id(is_string($id) ? $id : '');
    if (!$q || empty($q['isActive'])) not_found('Квест не найден');
    return $q;
}
function public_quest(array $q): array {
    unset($q['_schedule'], $q['isActive'], $q['sortOrder']);
    return $q;
}

// ------------------------------------------------------------------ время площадки
function venue_zone(): DateTimeZone { return new DateTimeZone((string)cfg('venue_tz', 'Asia/Yakutsk')); }
function iso_of(int $ts): string { return gmdate('Y-m-d\TH:i:s', $ts) . '.000Z'; }
function ts_of(string $iso): int { return (new DateTimeImmutable($iso))->getTimestamp(); }
function at_venue(string $dateKey, string $hhmm): int {
    return (new DateTimeImmutable("$dateKey $hhmm", venue_zone()))->getTimestamp();
}
function venue_date_key(int $ts): string {
    return (new DateTimeImmutable("@$ts"))->setTimezone(venue_zone())->format('Y-m-d');
}
function weekday_of(string $dateKey): int {
    return (int)(new DateTimeImmutable($dateKey . 'T12:00:00', new DateTimeZone('UTC')))->format('w'); // 0=вс
}
function shift_key(string $dateKey, int $days): string {
    return (new DateTimeImmutable($dateKey . 'T12:00:00', new DateTimeZone('UTC')))
        ->modify(($days >= 0 ? '+' : '') . $days . ' days')->format('Y-m-d');
}

// ------------------------------------------------------------------ сетка
function build_grid(array $quest, string $dateKey): array {
    $sch = $quest['_schedule'];
    $from = at_venue($dateKey, $sch['from']);
    $to   = at_venue($dateKey, $sch['to']);
    if ($to <= $from) $to += DAY_SEC;
    $dur  = $quest['durationMin'] * 60;
    $step = ($quest['durationMin'] + (int)$sch['break']) * 60;
    $out = [];
    for ($t = $from; $t + $dur <= $to; $t += $step) {
        $out[] = ['start' => $t, 'end' => $t + $dur, 'group' => 0];
    }
    return $out;
}
function slot_price(array $quest, int $startTs): int {
    $key = venue_date_key($startTs);
    $wd = weekday_of($key);
    $hh = (int)(new DateTimeImmutable("@$startTs"))->setTimezone(venue_zone())->format('G');
    $peak = ($wd === 0 || $wd === 6 || $hh >= 17 || $hh < 5) ? (int)$quest['peakExtra'] : 0;
    return (int)$quest['basePrice'] + $peak;
}

function overlaps(int $a1, int $a2, int $b1, int $b2): bool { return $a1 < $b2 && $b1 < $a2; }

/** @return list<array{start:string,end:string,price:int,available:bool,doubleAvailable:bool}> */
function get_slots(string $questId, string $dateKey, array $opts = []): array {
    $quest = quest_by_id($questId);
    if (!$quest) return [];
    $grid = build_grid($quest, $dateKey);
    if (!$grid) return [];
    $pdo = db();
    $userId = $opts['userId'] ?? null;
    $exclude = $opts['exclude'] ?? [];

    $busy = [];
    $ph = implode(',', array_fill(0, count(ACTIVE_STATUSES), '?'));
    $st = $pdo->prepare("SELECT id, start_at, end_at FROM bookings WHERE quest_id = ? AND status IN ($ph)");
    $st->execute(array_merge([$questId], ACTIVE_STATUSES));
    foreach ($st->fetchAll() as $b) {
        if (in_array($b['id'], $exclude, true)) continue;
        $busy[] = [ts_of($b['start_at']), ts_of($b['end_at'])];
    }
    $hs = $pdo->prepare('SELECT user_id, start_at, end_at, expires_at FROM holds WHERE quest_id = ?');
    $hs->execute([$questId]);
    foreach ($hs->fetchAll() as $h) {
        if (ts_of($h['expires_at']) <= time()) continue;
        if ($userId !== null && $h['user_id'] === $userId) continue;
        $busy[] = [ts_of($h['start_at']), ts_of($h['end_at'])];
    }

    $minStart = time() + (!empty($opts['ignoreLead']) ? 0 : (int)data_all()['booking']['leadMinutes'] * 60);
    $base = array_map(function ($g) use ($quest, $minStart, $busy) {
        $avail = $g['start'] >= $minStart;
        if ($avail) foreach ($busy as [$s, $e]) if (overlaps($g['start'], $g['end'], $s, $e)) { $avail = false; break; }
        return $g + ['price' => slot_price($quest, $g['start']), 'available' => $avail];
    }, $grid);

    $out = [];
    foreach ($base as $idx => $sl) {
        $next = $base[$idx + 1] ?? null;
        $out[] = [
            'start' => iso_of($sl['start']),
            'end'   => iso_of($sl['end']),
            'price' => $sl['price'],
            'available' => $sl['available'],
            'doubleAvailable' => $sl['available'] && $next && $next['group'] === $sl['group'] && $next['available'],
        ];
    }
    return $out;
}

/** @return list|null — найденные слоты ([one] или [first,second]) либо null, если занято */
function resolve_slots(string $questId, string $startAt, bool $double, array $opts = []): ?array {
    $t = ts_of($startAt);
    if ($t <= 0) fail(400, 'Некорректное время', 'VALIDATION');
    $key = venue_date_key($t);
    foreach ([$key, shift_key($key, -1)] as $date) {
        $slots = get_slots($questId, $date, $opts);
        $idx = null;
        foreach ($slots as $k => $sl) if (ts_of($sl['start']) === $t) { $idx = $k; break; }
        if ($idx === null) continue;
        $first = $slots[$idx];
        if (!$first['available']) return null;
        if (!$double) return [$first];
        if (!$first['doubleAvailable']) return null;
        return [$first, $slots[$idx + 1]];
    }
    return null;
}

// ------------------------------------------------------------------ цены
function tier_for(int $points, array $loyalty): array {
    $tiers = $loyalty['tiers'];
    usort($tiers, fn($a, $b) => $a['from'] <=> $b['from']);
    $current = $tiers[0]; $next = null;
    foreach ($tiers as $k => $t) if ($points >= $t['from']) { $current = $t; $next = $tiers[$k + 1] ?? null; }
    return ['percent' => (int)$current['percent'], 'next' => $next];
}
function find_promo($code): ?array {
    if (!is_string($code) || trim($code) === '') return null;
    // Промокоды/сертификаты пока не заведены.
    fail(400, 'Промокод не найден', 'PROMO_INVALID');
    return null;
}

function quote(array $slotPrices, ?array $user, $promoCode = null, array $opts = []): array {
    $d = data_all();
    $booking = $d['booking'];
    $gamesBase = array_sum($slotPrices);
    $players = max(1, (int)($opts['players'] ?? 0));
    $double = !empty($opts['double']);
    $playersExtra = $double ? 0 : (int)$booking['extraPlayerPrice'] * max(0, $players - (int)$booking['basePlayers']);

    $picks = is_array($opts['extras'] ?? null) ? $opts['extras'] : [];
    $pickId = fn($x) => is_array($x) ? ($x['id'] ?? null) : $x;
    $findExtra = function ($id) use ($d) { foreach ($d['extras'] as $e) if ($e['id'] === $id) return $e; return null; };
    $roomSelected = false;
    foreach ($picks as $x) { $e = $findExtra($pickId($x)); if ($e && $e['unit'] === 'hour') { $roomSelected = true; break; } }

    $extras = [];
    foreach ($picks as $x) {
        $e = $findExtra($pickId($x));
        if (!$e) continue;
        if (!empty($e['requiresRoom']) && !$roomSelected) continue;
        $qty = is_array($x) ? max(1, (int)($x['qty'] ?? 1)) : 1;
        $extras[] = [
            'label' => $e['label'] . ($e['unit'] === 'hour' ? " ×$qty ч" : ''),
            'price' => $e['unit'] === 'hour' ? (int)$e['price'] * $qty : (int)$e['price'],
        ];
    }
    $extrasTotal = array_sum(array_column($extras, 'price'));

    $basePrice = $gamesBase + $playersExtra + $extrasTotal;
    $loyaltyPercent = $user ? tier_for((int)$user['points'], $d['loyalty'])['percent'] : 0;
    $promo = find_promo($promoCode);
    $percent = min(50, $loyaltyPercent + ($promo['discountPercent'] ?? 0));
    $discountAmount = (int)min($basePrice, round($basePrice * $percent / 100) + ($promo['discountAmount'] ?? 0));
    $finalPrice = $basePrice - $discountAmount;
    $prepay = $booking['prepayMode'] === 'prepay' ? (int)min($booking['prepayAmount'], $finalPrice) : 0;

    return [
        'basePrice' => $basePrice, 'gamesBase' => $gamesBase, 'playersExtra' => $playersExtra,
        'extrasTotal' => $extrasTotal, 'extras' => $extras,
        'loyaltyPercent' => $loyaltyPercent,
        'promo' => $promo ? ['code' => $promo['code'], 'isCertificate' => (bool)$promo['isCertificate'], 'percent' => $promo['discountPercent'], 'amount' => $promo['discountAmount']] : null,
        'discountPercent' => $percent, 'discountAmount' => $discountAmount,
        'finalPrice' => $finalPrice, 'prepay' => $prepay,
    ];
}

// ------------------------------------------------------------------ валидация игроков
function validate_players(array $quest, int $players, array $ages, bool $double): void {
    if ($players < 1) fail(400, 'Укажите количество игроков', 'VALIDATION');
    if ($players < $quest['minPlayers']) fail(400, "Минимум игроков для этого квеста — {$quest['minPlayers']}", 'PLAYERS_MIN');
    if ($players > $quest['maxPlayers']) {
        if (!$double) fail(400, "Максимум игроков — {$quest['maxPlayers']}. Можно арендовать два сеанса подряд.", 'PLAYERS_OVER_LIMIT');
        if ($players > $quest['maxPlayers'] * 2) fail(400, "Даже на два сеанса — не более " . ($quest['maxPlayers'] * 2) . " игроков", 'PLAYERS_DOUBLE_MAX');
    } elseif ($double) {
        fail(400, 'Двойной сеанс доступен, только если игроков больше максимума', 'DOUBLE_NOT_NEEDED');
    }
    if (!$ages) fail(400, 'Укажите возраст игроков', 'AGES_REQUIRED');
    if (min($ages) < $quest['minAge']) fail(400, "Квест доступен с {$quest['minAge']} лет", 'AGE_RESTRICTED');
}

// ------------------------------------------------------------------ брони (запись в БД)
function insert_booking(array $b): void {
    $cols = ['id','user_id','quest_id','start_at','end_at','players_count','ages','status','source','base_price','discount_percent','discount_amount','promo_code','final_price','prepaid','comment','admin_note','is_double_session','linked_booking_id','passed','time_spent_min','points_awarded','created_at'];
    $ph = implode(',', array_fill(0, count($cols), '?'));
    $st = db()->prepare('INSERT INTO bookings (' . implode(',', $cols) . ") VALUES ($ph)");
    $st->execute(array_map(fn($c) => $b[$c] ?? null, $cols));
}

function create_booking(array $user, array $quest, array $o): array {
    $ages = array_values(array_filter(array_map('intval', (array)($o['ages'] ?? [])), fn($n) => $n > 0));
    $double = !empty($o['double']);
    $players = (int)($o['players'] ?? 0);
    validate_players($quest, $players, $ages, $double);

    $slots = resolve_slots($quest['id'], (string)($o['startAt'] ?? ''), $double, ['userId' => $user['id'], 'ignoreLead' => !empty($o['ignoreLead'])]);
    if (!$slots) fail(409, 'Это время уже занято. Выберите другой сеанс.', 'SLOT_TAKEN');

    $price = quote(array_column($slots, 'price'), $user, $o['promoCode'] ?? null, ['players' => $players, 'double' => $double, 'extras' => $o['extras'] ?? null]);
    $finalPrice = $o['finalPrice'] ?? $price['finalPrice'];
    $extrasNote = $price['extras'] ? 'Опции: ' . implode(', ', array_column($price['extras'], 'label')) : '';
    $comment = trim((string)($o['comment'] ?? ''));
    $fullComment = implode(' · ', array_filter([$comment !== '' ? $comment : null, $extrasNote ?: null])) ?: null;

    $agesJson = json_encode($ages, JSON_UNESCAPED_UNICODE);
    $base = [
        'user_id' => $user['id'], 'quest_id' => $quest['id'], 'players_count' => $players, 'ages' => $agesJson,
        'status' => 'NEW', 'source' => $o['source'] ?? 'WEB', 'prepaid' => 0, 'admin_note' => null,
        'passed' => null, 'time_spent_min' => null, 'points_awarded' => 0, 'created_at' => now_iso(),
    ];
    $secondId = null;
    if (isset($slots[1])) {
        $secondId = uid();
        insert_booking($base + [
            'id' => $secondId, 'start_at' => $slots[1]['start'], 'end_at' => $slots[1]['end'],
            'base_price' => 0, 'discount_percent' => 0, 'discount_amount' => 0, 'promo_code' => null,
            'final_price' => 0, 'comment' => 'Второй сеанс двойной аренды', 'is_double_session' => 1, 'linked_booking_id' => null,
        ]);
    }
    $mainId = uid();
    insert_booking($base + [
        'id' => $mainId, 'start_at' => $slots[0]['start'], 'end_at' => $slots[0]['end'],
        'base_price' => $price['basePrice'], 'discount_percent' => $price['discountPercent'],
        'discount_amount' => $price['basePrice'] - $finalPrice, 'promo_code' => $price['promo']['code'] ?? null,
        'final_price' => $finalPrice, 'comment' => $fullComment, 'is_double_session' => $secondId ? 1 : 0, 'linked_booking_id' => $secondId,
    ]);

    db()->prepare('DELETE FROM holds WHERE user_id = ?')->execute([$user['id']]);

    $row = find_booking($mainId);
    notify_new_booking($row, $user, $quest, $price);
    return $row;
}

function find_booking(string $id): ?array {
    $st = db()->prepare('SELECT * FROM bookings WHERE id = ?');
    $st->execute([$id]);
    return $st->fetch() ?: null;
}

function row_to_booking(array $r): array {
    return [
        'id' => $r['id'], 'userId' => $r['user_id'], 'questId' => $r['quest_id'],
        'startAt' => $r['start_at'], 'endAt' => $r['end_at'],
        'playersCount' => (int)$r['players_count'], 'ages' => json_decode($r['ages'] ?: '[]', true) ?: [],
        'status' => $r['status'], 'source' => $r['source'],
        'basePrice' => (int)$r['base_price'], 'discountPercent' => (int)$r['discount_percent'],
        'discountAmount' => (int)$r['discount_amount'], 'promoCode' => $r['promo_code'],
        'finalPrice' => (int)$r['final_price'], 'prepaid' => (int)$r['prepaid'],
        'comment' => $r['comment'], 'adminNote' => $r['admin_note'],
        'isDoubleSession' => (bool)$r['is_double_session'], 'linkedBookingId' => $r['linked_booking_id'],
        'passed' => $r['passed'] === null ? null : (bool)$r['passed'],
        'timeSpentMin' => $r['time_spent_min'] === null ? null : (int)$r['time_spent_min'],
        'pointsAwarded' => (bool)$r['points_awarded'], 'createdAt' => $r['created_at'],
    ];
}

function booking_view(array $r, bool $withUser = false): array {
    $b = row_to_booking($r);
    $q = quest_by_id($r['quest_id']);
    $b['quest'] = $q ? ['id' => $q['id'], 'slug' => $q['slug'], 'title' => $q['title'], 'photoUrl' => $q['photoUrl'], 'durationMin' => $q['durationMin'], 'roomNumber' => $q['roomNumber'], 'fearLevel' => $q['fearLevel']] : null;
    $linked = null;
    if ($r['linked_booking_id']) {
        $lr = find_booking($r['linked_booking_id']);
        if ($lr) $linked = ['id' => $lr['id'], 'startAt' => $lr['start_at'], 'endAt' => $lr['end_at']];
    }
    $b['linkedBooking'] = $linked;
    if ($withUser) {
        $u = find_user($r['user_id']);
        $b['user'] = $u ? ['id' => $u['id'], 'name' => $u['name'], 'phone' => $u['phone'], 'points' => (int)$u['points'], 'blocked' => (bool)$u['blocked']] : null;
    }
    return $b;
}

/** Служебная вторая бронь двойной аренды (на неё кто-то ссылается linked_booking_id). */
function is_second(array $r): bool {
    $st = db()->prepare('SELECT 1 FROM bookings WHERE linked_booking_id = ? LIMIT 1');
    $st->execute([$r['id']]);
    return (bool)$st->fetchColumn();
}

function set_booking_status(string $id, string $status, array $extra = []): array {
    $pdo = db();
    $b = find_booking($id);
    if (!$b) not_found('Запись не найдена');
    $sets = ['status = ?']; $vals = [$status];
    if (array_key_exists('passed', $extra)) { $sets[] = 'passed = ?'; $vals[] = $extra['passed']; }
    if (array_key_exists('timeSpentMin', $extra)) { $sets[] = 'time_spent_min = ?'; $vals[] = $extra['timeSpentMin']; }
    $vals[] = $id;
    $pdo->prepare('UPDATE bookings SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($vals);
    if ($b['linked_booking_id']) $pdo->prepare('UPDATE bookings SET status = ? WHERE id = ?')->execute([$status, $b['linked_booking_id']]);
    return find_booking($id);
}

// ------------------------------------------------------------------ уведомление оператору
function notify_new_booking(array $row, array $user, array $quest, array $price): void {
    $b = row_to_booking($row);
    $when = (new DateTimeImmutable($b['startAt']))->setTimezone(venue_zone())->format('d.m.Y H:i');
    $lines = [
        '🧩 <b>Новая запись</b> — ' . $quest['title'],
        '🗓 ' . $when,
        '👥 Игроков: ' . $b['playersCount'],
        '👤 ' . ($user['name'] ?: 'Без имени') . ' · ' . $user['phone'],
        '💰 Сумма: ' . number_format($b['finalPrice'], 0, '.', ' ') . ' ₽' . ($price['prepay'] ? ' · предоплата ' . $price['prepay'] . ' ₽' : ''),
    ];
    if ($b['comment']) $lines[] = '📝 ' . $b['comment'];
    try { notify_operators(implode("\n", $lines)); } catch (Throwable $e) {}
}
