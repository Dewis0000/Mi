<?php
/**
 * Фронт-контроллер API боевого сайта Neru-Квест.
 * Apache направляет сюда всё /api/* (см. .htaccess). Локально — через router.php.
 */
declare(strict_types=1);

// lib/ может лежать над docroot (server-php/lib — безопаснее) или внутри него
// (docroot/lib — если корень сайта поменять нельзя). Поддерживаем оба варианта.
$LIB = null;
foreach ([__DIR__ . '/../../lib', __DIR__ . '/../lib'] as $cand) {
    if (is_file($cand . '/bootstrap.php')) { $LIB = $cand; break; }
}
if (!$LIB) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Не найдена папка lib/', 'code' => 'NO_LIB'], JSON_UNESCAPED_UNICODE);
    exit;
}
require $LIB . '/bootstrap.php';
require $LIB . '/notify.php';
require $LIB . '/auth.php';
require $LIB . '/slots.php';
require $LIB . '/bot_service.php';
require $LIB . '/bot.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uri    = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$path   = '/' . trim(preg_replace('#^/api#', '', $uri), '/');

/** Сопоставление маршрута с шаблоном (":x" — параметр). Возвращает params или null. */
function match_route(string $method, string $m, string $pattern, string $path): ?array {
    if ($method !== $m) return null;
    $pp = explode('/', trim($pattern, '/'));
    $ap = explode('/', trim($path, '/'));
    if (count($pp) !== count($ap)) return null;
    $params = [];
    foreach ($pp as $i => $seg) {
        if (strlen($seg) && $seg[0] === ':') $params[substr($seg, 1)] = urldecode($ap[$i]);
        elseif ($seg !== $ap[$i]) return null;
    }
    return $params;
}
function q(string $key, $default = null) { return $_GET[$key] ?? $default; }
function day_start(string $key): int { return at_venue($key, '00:00'); }
function admin_log(string $adminId, string $action, string $entity, ?string $entityId, $details = null): void {
    db()->prepare('INSERT INTO admin_logs (id, admin_id, action, entity, entity_id, details, created_at) VALUES (?,?,?,?,?,?,?)')
        ->execute([uid(), $adminId, $action, $entity, $entityId, $details === null ? null : json_encode($details, JSON_UNESCAPED_UNICODE), now_iso()]);
}

$R = fn(string $m, string $p) => match_route($method, $m, $p, $path);

/* ============================================================ диагностика (по секрету) */

if ($R('GET', '/_diag') !== null) {
    if (!hash_equals(hash_hmac('sha256', 'diag', (string)cfg('app_secret')), (string)q('s'))) fail(403, 'forbidden');
    $pdo = db();
    $info = ['php' => PHP_VERSION, 'driver' => $pdo->getAttribute(PDO::ATTR_DRIVER_NAME), 'server' => $pdo->getAttribute(PDO::ATTR_SERVER_VERSION)];
    $tables = ['users', 'bookings', 'holds', 'sessions', 'auth_codes', 'points_log', 'admin_logs', 'messenger_links', 'kv_store'];
    $counts = [];
    foreach ($tables as $t) {
        try { $counts[$t] = (int)$pdo->query("SELECT COUNT(*) FROM $t")->fetchColumn(); }
        catch (Throwable $e) { $counts[$t] = 'ERR: ' . $e->getMessage(); }
    }
    $bv = 'нет броней';
    try {
        $r = $pdo->query('SELECT * FROM bookings ORDER BY start_at DESC LIMIT 1')->fetch();
        if ($r) { booking_view($r, true); $bv = 'ok'; }
    } catch (Throwable $e) { $bv = 'ERR: ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine(); }
    $log = '';
    $lf = $LIB . '/error.log';
    if (is_file($lf)) { $log = implode('', array_slice(file($lf) ?: [], -40)); }
    out(['info' => $info, 'counts' => $counts, 'bookingView' => $bv, 'errorLog' => $log]);
}

// Починка схемы: пересоздаёт таблицы, у которых не хватает колонок (напр. старая
// таблица bookings из прежней БД). Таблицы с верной схемой не трогает.
if ($R('GET', '/_fixdb') !== null) {
    if (!hash_equals(hash_hmac('sha256', 'fixdb', (string)cfg('app_secret')), (string)q('s'))) fail(403, 'forbidden');
    $pdo = db();
    $driver = cfg('db', [])['driver'] ?? 'mysql';
    $suffix = $driver === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    $res = [];
    foreach (schema_tables() as $name => $cols) {
        $expected = schema_columns($cols);
        $actual = [];
        try {
            if ($driver === 'mysql') {
                $st = $pdo->prepare('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
                $st->execute([$name]);
                $actual = array_map('strtolower', array_column($st->fetchAll(), 'COLUMN_NAME'));
            } else {
                foreach ($pdo->query("PRAGMA table_info($name)")->fetchAll() as $c) $actual[] = strtolower($c['name']);
            }
        } catch (Throwable $e) {}
        $missing = array_values(array_diff($expected, $actual));
        if (!$actual) {
            $pdo->exec("CREATE TABLE IF NOT EXISTS $name $cols$suffix");
            $res[$name] = 'создана';
        } elseif ($missing) {
            $cnt = 0;
            try { $cnt = (int)$pdo->query("SELECT COUNT(*) FROM `$name`")->fetchColumn(); } catch (Throwable $e) {}
            $pdo->exec("DROP TABLE `$name`");
            $pdo->exec("CREATE TABLE $name $cols$suffix");
            $res[$name] = "пересоздана (было строк: $cnt; не хватало колонок: " . implode(',', $missing) . ')';
        } else {
            $res[$name] = 'ок';
        }
    }
    out(['fixed' => $res]);
}

/* ============================================================ публичные */

if (($p = $R('GET', '/content')) !== null) {
    $d = data_all();
    out([
        'site' => $d['site'], 'contacts' => $d['contacts'],
        'booking' => [
            'prepayMode' => $d['booking']['prepayMode'], 'prepayPercent' => $d['booking']['prepayPercent'],
            'prepayAmount' => $d['booking']['prepayAmount'], 'basePlayers' => $d['booking']['basePlayers'],
            'extraPlayerPrice' => $d['booking']['extraPlayerPrice'], 'cancelHours' => $d['booking']['cancelHours'],
            'holdMinutes' => $d['booking']['holdMinutes'],
        ],
        'extras' => $d['extras'], 'loyalty' => $d['loyalty'],
        'recordings' => ['price' => $d['recordings']['price'], 'linkDays' => $d['recordings']['linkDays']],
    ]);
}
if ($R('GET', '/quests') !== null && $path === '/quests') {
    $list = array_values(array_filter(quests_all(), fn($q) => !empty($q['isActive'])));
    usort($list, fn($a, $b) => $a['sortOrder'] <=> $b['sortOrder']);
    out(array_map('public_quest', $list));
}
if (($p = $R('GET', '/quests/:slug')) !== null) {
    if (!in_array($path, ['/quests/calendar'], true)) {
        $qd = quest_by_id($p['slug']);
        if (!$qd || empty($qd['isActive'])) not_found('Квест не найден');
        out(public_quest($qd));
    }
}
if (($p = $R('GET', '/quests/:id/calendar')) !== null) {
    [$y, $m] = array_map('intval', explode('-', (string)q('month')) + [0, 0]);
    if (!$y || !$m) fail(400, 'Некорректный месяц', 'VALIDATION');
    $days = (int)(new DateTimeImmutable(sprintf('%04d-%02d-01', $y, $m)))->format('t');
    $today = venue_date_key(time());
    $horizon = shift_key($today, (int)data_all()['booking']['horizonDays']);
    $u = current_user();
    $res = [];
    for ($i = 1; $i <= $days; $i++) {
        $key = sprintf('%04d-%02d-%02d', $y, $m, $i);
        if ($key < $today || $key > $horizon) { $res[] = ['date' => $key, 'free' => 0, 'total' => 0]; continue; }
        $slots = get_slots($p['id'], $key, ['userId' => $u['id'] ?? null]);
        $free = count(array_filter($slots, fn($s) => $s['available']));
        $res[] = ['date' => $key, 'free' => $free, 'total' => count($slots)];
    }
    out($res);
}
if (($p = $R('GET', '/quests/:id/slots')) !== null) {
    $u = current_user();
    out(get_slots($p['id'], (string)q('date'), ['userId' => $u['id'] ?? null]));
}

/* ============================================================ боты (webhook; на reg.ru приём идёт через cron-опрос, см. poll.php) */

if ($R('POST', '/bot/telegram') !== null) {
    $expected = hash_hmac('sha256', 'tg-webhook', (string)cfg('app_secret'));
    $got = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '';
    if (!hash_equals($expected, $got)) out(['ok' => true]);
    $upd = body();
    $msg = $upd['message'] ?? ($upd['edited_message'] ?? null);
    if (is_array($msg)) bot_tg_handle($msg);
    out(['ok' => true]);
}

if ($R('POST', '/bot/max') !== null) {
    $expected = hash_hmac('sha256', 'max-webhook', (string)cfg('app_secret'));
    if (!hash_equals($expected, (string)($_GET['s'] ?? ''))) out(['ok' => true]);
    bot_max_handle(body());
    out(['ok' => true]);
}

/* ============================================================ вход */

if ($R('POST', '/auth/code') !== null) {
    $b = body();
    $phone = phone_or_fail($b['phone'] ?? null);
    if (!empty($b['website'])) out(['ok' => true, 'resendIn' => 60]); // ловушка для ботов
    $existing = find_user_by_phone($phone);
    if ($existing && (int)$existing['blocked']) fail(403, 'Аккаунт заблокирован. Свяжитесь с администратором.', 'BLOCKED');
    if (!$existing && empty($b['consent'])) fail(400, 'Необходимо согласие на обработку персональных данных', 'CONSENT_REQUIRED');
    $channel = s($b['channel'] ?? 'TELEGRAM');
    $base = ['ok' => true, 'isNewUser' => !$existing, 'hasPassword' => !empty($existing['password_hash'])];

    // Внешний бот-сервис (Cloudflare): коды входа идут через него.
    if (bs_enabled()) {
        $r = bs_request_code($phone, $channel);
        if ($r['ok']) {
            if ($r['rateLimited']) fail(429, 'Слишком много запросов кода. Подождите немного и попробуйте снова.', 'RATE_LIMIT', ['retryIn' => $r['retryIn']]);
            if ($r['delivered']) out($base + ['resendIn' => 60, 'sentTo' => $r['channel']]);
            out($base + ['resendIn' => 0, 'needsMessenger' => true, 'botUrl' => $r['botUrl'], 'messenger' => $channel]);
        }
        // воркер недоступен — используем локальную логику ниже (не падаем)
    }

    $tgLinked  = link_chat_for_phone('TELEGRAM', $phone) !== null;
    $maxLinked = link_chat_for_phone('MAX', $phone) !== null;
    $canDeliver = $tgLinked || $maxLinked || cfg('telegram_gateway_token', '') !== '';

    if ($canDeliver) {
        $issued = issue_code($phone, 'auth');
        $delivered = deliver_login_code($phone, $issued['_code'], $channel);
        $resp = $base + ['resendIn' => $issued['resendIn'], 'sentTo' => $delivered ? (($maxLinked && $channel === 'MAX') ? 'max' : 'telegram') : null];
        // dev-код показываем на экране только в dev-режиме и НИКОГДА для персонала/владельца (защита от захвата админки)
        if (!$delivered && cfg('expose_dev_codes', false) && !bot_is_staff($phone)) $resp['devCode'] = $issued['_code'];
        out($resp);
    }

    // Бот ещё не привязан к этому номеру — отправляем человека в бота (там он поделится номером и получит код).
    $resp = $base + ['resendIn' => 0, 'needsMessenger' => true, 'messenger' => $channel];
    if ($channel === 'MAX') {
        $mu = (string)cfg('max_bot_username', 'id272499215410_bot');
        if ($mu) $resp['botUrl'] = "https://max.ru/$mu";
    } else {
        $tu = (string)cfg('telegram_bot_username', 'Neru_kvestBot');
        if ($tu) $resp['botUrl'] = "https://t.me/$tu?start=auth";
    }
    if (cfg('expose_dev_codes', false) && !bot_is_staff($phone)) $resp['devCode'] = issue_code($phone, 'auth')['_code'];
    out($resp);
}

if ($R('POST', '/auth/verify') !== null) {
    $b = body();
    $phone = phone_or_fail($b['phone'] ?? null);
    if (bs_enabled()) {
        if (!bs_verify_code($phone, s($b['code'] ?? ''))) fail(400, 'Неверный код', 'CODE_INVALID');
    } else {
        consume_code($phone, $b['code'] ?? null, 'auth');
    }
    $u = find_user_by_phone($phone);
    if (!$u) {
        $id = uid();
        $messenger = in_array(s($b['channel'] ?? ''), ['TELEGRAM', 'VK', 'MAX'], true) ? s($b['channel']) : 'TELEGRAM';
        $role = in_array($phone, (array)cfg('owner_phones', []), true) ? 'owner' : null;
        db()->prepare('INSERT INTO users (id, phone, phone_verified, messenger, role_key, created_at) VALUES (?,?,1,?,?,?)')
            ->execute([$id, $phone, $messenger, $role, now_iso()]);
        $u = find_user($id);
    } else {
        db()->prepare('UPDATE users SET phone_verified = 1 WHERE id = ?')->execute([$u['id']]);
        if ((int)$u['blocked']) fail(403, 'Аккаунт заблокирован', 'BLOCKED');
        $u = find_user($u['id']);
    }
    out(start_session($u));
}

if ($R('POST', '/auth/password') !== null) {
    $b = body();
    $phone = normalize_phone($b['phone'] ?? null);
    $u = $phone ? find_user_by_phone($phone) : null;
    if (!$u || empty($u['password_hash']) || !password_verify(s($b['password'] ?? ''), $u['password_hash'])) {
        fail(401, 'Неверный телефон или пароль', 'BAD_CREDENTIALS');
    }
    if ((int)$u['blocked']) fail(403, 'Аккаунт заблокирован', 'BLOCKED');
    out(start_session($u));
}

if ($R('POST', '/auth/refresh') !== null) {
    $rt = $_COOKIE['rt'] ?? '';
    if (!$rt) fail(401, 'Сессия истекла', 'NO_REFRESH');
    $st = db()->prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?');
    $st->execute([hash('sha256', $rt), time()]);
    $sess = $st->fetch();
    if (!$sess) { clear_session_cookies(); fail(401, 'Сессия истекла', 'NO_REFRESH'); }
    $u = find_user($sess['user_id']);
    if (!$u || (int)$u['blocked']) { clear_session_cookies(); fail(401, 'Сессия истекла', 'NO_REFRESH'); }
    db()->prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')->execute([time() + 30 * 86400, $sess['id']]);
    set_session_cookies($rt);
    out(auth_response($u));
}

if ($R('POST', '/auth/logout') !== null) {
    $rt = $_COOKIE['rt'] ?? '';
    if ($rt) db()->prepare('DELETE FROM sessions WHERE id = ?')->execute([hash('sha256', $rt)]);
    clear_session_cookies();
    out(['ok' => true]);
}

/* ============================================================ профиль */

if ($R('GET', '/profile') !== null) out(serialize_user(require_user()));

if ($R('PATCH', '/profile') !== null) {
    $u = require_user(); $b = body(); $set = []; $val = [];
    if (array_key_exists('name', $b)) {
        $name = trim(s($b['name']));
        if (mb_strlen($name) < 2) fail(400, 'Имя слишком короткое', 'VALIDATION');
        $set[] = 'name = ?'; $val[] = mb_substr($name, 0, 60);
    }
    if (array_key_exists('birthDate', $b)) { $set[] = 'birth_date = ?'; $val[] = $b['birthDate'] ? (new DateTimeImmutable(s($b['birthDate'])))->format('Y-m-d\T00:00:00') . '.000Z' : null; }
    if (array_key_exists('email', $b)) {
        $email = trim(s($b['email']));
        if ($email !== '' && !preg_match('/^\S+@\S+\.\S+$/', $email)) fail(400, 'Некорректный e-mail', 'VALIDATION');
        $set[] = 'email = ?'; $val[] = $email ?: null;
    }
    if (array_key_exists('messenger', $b) && in_array(s($b['messenger']), ['TELEGRAM', 'VK', 'MAX'], true)) { $set[] = 'messenger = ?'; $val[] = s($b['messenger']); }
    if (!empty($b['vkUserId'])) { $set[] = 'vk_user_id = ?'; $val[] = s($b['vkUserId']); }
    if (!empty($b['maxUserId'])) { $set[] = 'max_user_id = ?'; $val[] = s($b['maxUserId']); }
    if (isset($b['notify']) && is_array($b['notify'])) {
        foreach (['bookings' => 'notify_bookings', 'reminders' => 'notify_reminders', 'promo' => 'notify_promo'] as $k => $col) {
            if (array_key_exists($k, $b['notify'])) { $set[] = "$col = ?"; $val[] = $b['notify'][$k] ? 1 : 0; }
        }
    }
    if ($set) { $val[] = $u['id']; db()->prepare('UPDATE users SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($val); }
    out(serialize_user(find_user($u['id'])));
}

if ($R('POST', '/profile/password') !== null) {
    $u = require_user();
    $pw = s(body()['password'] ?? '');
    if (strlen($pw) < 8) fail(400, 'Минимум 8 символов', 'VALIDATION');
    db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
    out(['ok' => true]);
}

if ($R('POST', '/profile/phone/code') !== null) {
    $u = require_user();
    $phone = phone_or_fail(body()['phone'] ?? null);
    if (find_user_by_phone($phone)) fail(400, 'Этот номер уже занят', 'PHONE_TAKEN');
    $issued = issue_code($phone, 'change:' . $u['id']);
    $delivered = deliver_login_code($phone, $issued['_code'], $u['messenger']);
    $resp = ['ok' => true, 'resendIn' => $issued['resendIn']];
    if (!$delivered && cfg('expose_dev_codes', false)) $resp['devCode'] = $issued['_code'];
    out($resp);
}

if ($R('POST', '/profile/phone/verify') !== null) {
    $u = require_user(); $b = body();
    $phone = phone_or_fail($b['phone'] ?? null);
    consume_code($phone, $b['code'] ?? null, 'change:' . $u['id']);
    db()->prepare('UPDATE users SET phone = ?, phone_verified = 1 WHERE id = ?')->execute([$phone, $u['id']]);
    out(serialize_user(find_user($u['id'])));
}

if ($R('GET', '/profile/link/telegram') !== null) {
    require_user();
    $username = (string)cfg('telegram_bot_username', '');
    if (!$username) fail(400, 'Привязка Telegram пока не настроена.', 'NOT_CONFIGURED');
    out(['url' => "https://t.me/$username"]);
}

if ($R('GET', '/profile/loyalty') !== null) {
    $u = require_user();
    $loyalty = data_all()['loyalty'];
    $tier = tier_for((int)$u['points'], $loyalty);
    $log = db()->prepare('SELECT * FROM points_log WHERE user_id = ? ORDER BY created_at DESC');
    $log->execute([$u['id']]);
    out([
        'points' => (int)$u['points'], 'percent' => $tier['percent'], 'nextTier' => $tier['next'],
        'tiers' => $loyalty['tiers'], 'pointsPerVisit' => $loyalty['pointsPerVisit'],
        'burn' => ['afterMonths' => $loyalty['burnAfterMonths'], 'percentPerMonth' => $loyalty['burnPercentPerMonth'], 'nextAt' => null, 'amount' => 0, 'warning' => false],
        'lastVisitAt' => $u['last_visit_at'], 'log' => $log->fetchAll(),
    ]);
}

if ($R('GET', '/profile/recordings') !== null) { require_user(); out([]); }

/* ============================================================ запись */

if ($R('POST', '/bookings/hold') !== null) {
    $u = require_user(); $b = body();
    active_quest($b['questId'] ?? null);
    db()->prepare('DELETE FROM holds WHERE user_id = ?')->execute([$u['id']]);
    $slots = resolve_slots(s($b['questId'] ?? ''), s($b['startAt'] ?? ''), !empty($b['double']), ['userId' => $u['id']]);
    if (!$slots) fail(409, 'Этот сеанс уже заняли — выберите другое время', 'SLOT_TAKEN');
    $expiresAt = iso_of(time() + (int)data_all()['booking']['holdMinutes'] * 60);
    db()->prepare('INSERT INTO holds (id, quest_id, user_id, start_at, end_at, expires_at) VALUES (?,?,?,?,?,?)')
        ->execute([uid(), s($b['questId']), $u['id'], $slots[0]['start'], $slots[count($slots) - 1]['end'], $expiresAt]);
    out(['expiresAt' => $expiresAt, 'slots' => $slots]);
}

if ($R('DELETE', '/bookings/hold') !== null) {
    $u = require_user();
    db()->prepare('DELETE FROM holds WHERE user_id = ?')->execute([$u['id']]);
    out(['ok' => true]);
}

if ($R('POST', '/bookings/quote') !== null) {
    $u = require_user(); $b = body();
    active_quest($b['questId'] ?? null);
    $slots = resolve_slots(s($b['questId'] ?? ''), s($b['startAt'] ?? ''), !empty($b['double']), ['userId' => $u['id']]);
    if (!$slots) fail(409, 'Этот сеанс уже заняли — выберите другое время', 'SLOT_TAKEN');
    out(quote(array_column($slots, 'price'), $u, $b['promoCode'] ?? null, ['players' => i($b['playersCount'] ?? 0), 'double' => !empty($b['double']), 'extras' => $b['extras'] ?? null]));
}

if ($R('POST', '/bookings') !== null && $path === '/bookings') {
    $u = require_user(); $b = body();
    $quest = active_quest($b['questId'] ?? null);
    $row = create_booking($u, $quest, [
        'startAt' => s($b['startAt'] ?? ''), 'players' => i($b['playersCount'] ?? 0),
        'ages' => $b['ages'] ?? [], 'double' => !empty($b['double']),
        'comment' => mb_substr(s($b['comment'] ?? ''), 0, 1000), 'promoCode' => $b['promoCode'] ?? null, 'extras' => $b['extras'] ?? null,
    ]);
    out(['booking' => booking_view($row), 'payment' => null]);
}

if ($R('GET', '/bookings/my') !== null) {
    $u = require_user();
    $cancelHours = (int)data_all()['booking']['cancelHours'];
    $st = db()->prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY start_at DESC');
    $st->execute([$u['id']]);
    $mine = [];
    foreach ($st->fetchAll() as $r) { if (is_second($r)) continue; $mine[] = booking_view($r); }
    $now = time();
    $active = [];
    foreach (array_reverse($mine) as $b) {
        $end = $b['linkedBooking']['endAt'] ?? $b['endAt'];
        if (in_array($b['status'], ACTIVE_STATUSES, true) && ts_of($end) > $now) {
            $b['canChange'] = ts_of($b['startAt']) - $now >= $cancelHours * 3600;
            $b['isLive'] = ts_of($b['startAt']) <= $now && ts_of($end) > $now;
            $active[] = $b;
        }
    }
    $activeIds = array_column($active, 'id');
    $history = array_values(array_filter($mine, fn($b) => !in_array($b['id'], $activeIds, true)));
    out(['active' => $active, 'history' => $history, 'cancelHours' => $cancelHours]);
}

function own_changeable(string $id): array {
    $u = require_user();
    $b = find_booking($id);
    if (!$b || $b['user_id'] !== $u['id']) not_found('Запись не найдена');
    if (!in_array($b['status'], ACTIVE_STATUSES, true)) fail(400, 'Эту запись уже нельзя изменить');
    $hours = (int)data_all()['booking']['cancelHours'];
    if (ts_of($b['start_at']) - time() < $hours * 3600) {
        fail(400, "Отменить или перенести запись можно не позднее чем за $hours ч до начала. Позвоните администратору.", 'TOO_LATE');
    }
    return $b;
}

if (($p = $R('POST', '/bookings/:id/cancel')) !== null) {
    $b = own_changeable($p['id']);
    out(booking_view(set_booking_status($b['id'], 'CANCELLED')));
}

if (($p = $R('POST', '/bookings/:id/reschedule')) !== null) {
    $b = own_changeable($p['id']); $body = body();
    $double = !empty($b['linked_booking_id']);
    $slots = resolve_slots($b['quest_id'], s($body['startAt'] ?? ''), $double, ['userId' => $b['user_id'], 'exclude' => array_filter([$b['id'], $b['linked_booking_id']])]);
    if (!$slots) fail(409, 'Это время недоступно', 'SLOT_TAKEN');
    db()->prepare('UPDATE bookings SET start_at = ?, end_at = ?, status = ? WHERE id = ?')->execute([$slots[0]['start'], $slots[0]['end'], 'NEW', $b['id']]);
    if ($b['linked_booking_id'] && isset($slots[1])) {
        db()->prepare('UPDATE bookings SET start_at = ?, end_at = ?, status = ? WHERE id = ?')->execute([$slots[1]['start'], $slots[1]['end'], 'NEW', $b['linked_booking_id']]);
    }
    db()->prepare('DELETE FROM holds WHERE user_id = ?')->execute([$b['user_id']]);
    out(booking_view(find_booking($b['id'])));
}

/* ============================================================ админка */

function all_main_bookings(): array {
    $rows = db()->query('SELECT * FROM bookings ORDER BY start_at DESC')->fetchAll();
    return array_values(array_filter($rows, fn($r) => !is_second($r)));
}

/** Единый расчёт отчётности за период [fromKey, toKey] (ключи дат площадки). */
function report_data(string $fromKey, string $toKey): array {
    $from = day_start($fromKey);
    $to = day_start(shift_key($toKey, 1));
    $all = db()->query('SELECT * FROM bookings')->fetchAll();
    $ref = [];
    foreach ($all as $r) if (!empty($r['linked_booking_id'])) $ref[$r['linked_booking_id']] = true;
    $isSecond = fn($r) => isset($ref[$r['id']]);
    $inRange = array_values(array_filter($all, fn($r) => ts_of($r['start_at']) >= $from && ts_of($r['start_at']) < $to));
    $main = array_values(array_filter($inRange, fn($r) => !$isSecond($r)));
    $done = array_values(array_filter($main, fn($r) => $r['status'] === 'COMPLETED'));
    $revenue = (int)array_sum(array_map(fn($r) => (int)$r['final_price'], $done));
    $upcoming = count(array_filter($main, fn($r) => in_array($r['status'], ACTIVE_STATUSES, true)));
    $completedN = count($done);

    $dayKeys = [];
    for ($k = $fromKey; $k <= $toKey && count($dayKeys) < 400; $k = shift_key($k, 1)) $dayKeys[] = $k;
    $byDay = array_map(function ($date) use ($main) {
        $items = array_filter($main, fn($r) => venue_date_key(ts_of($r['start_at'])) === $date);
        return ['date' => $date, 'bookings' => count($items),
                'revenue' => (int)array_sum(array_map(fn($r) => $r['status'] === 'COMPLETED' ? (int)$r['final_price'] : 0, $items))];
    }, $dayKeys);

    $srcDefs = [['WEB', 'Сайт'], ['ADMIN', 'Админ'], ['PHONE', 'Телефон'], ['WALK_IN', 'Без записи']];
    $bySource = array_map(fn($p) => ['source' => $p[1], 'count' => count(array_filter($main, fn($r) => ($r['source'] ?? 'WEB') === $p[0]))], $srcDefs);

    $byQuest = array_map(function ($quest) use ($inRange, $isSecond, $dayKeys) {
        $totalSlots = 0;
        foreach ($dayKeys as $d) $totalSlots += count(build_grid($quest, $d));
        $qb = array_filter($inRange, fn($r) => $r['quest_id'] === $quest['id'] && in_array($r['status'], ['NEW', 'CONFIRMED', 'COMPLETED'], true));
        $qDone = array_filter($qb, fn($r) => $r['status'] === 'COMPLETED');
        return [
            'questId' => $quest['id'], 'title' => $quest['title'],
            'sessions' => count($qb), 'totalSlots' => $totalSlots,
            'load' => $totalSlots ? (int)round(count($qb) / $totalSlots * 100) : 0,
            'revenue' => (int)array_sum(array_map(fn($r) => (int)$r['final_price'], $qDone)),
            'players' => (int)array_sum(array_map(fn($r) => !$isSecond($r) ? (int)$r['players_count'] : 0, $qDone)),
        ];
    }, quests_all());

    return [
        'revenue' => $revenue, 'recordingsRevenue' => 0, 'prepayments' => 0,
        'bookings' => count($main), 'completed' => $completedN,
        'cancelled' => count(array_filter($main, fn($r) => $r['status'] === 'CANCELLED')),
        'noShows' => count(array_filter($main, fn($r) => $r['status'] === 'NO_SHOW')),
        'upcoming' => $upcoming,
        'avgCheck' => $completedN ? (int)round($revenue / $completedN) : 0,
        'conversion' => (count($main) - $upcoming) ? (int)round($completedN / (count($main) - $upcoming) * 100) : 0,
        'bySource' => $bySource, 'byQuest' => array_values($byQuest), 'byDay' => $byDay,
    ];
}

/** Минимальный валидный .xlsx из массива строк (каждая строка — список ячеек). */
function xlsx_build(array $rows): string {
    $colLetter = function (int $n): string {
        $s = '';
        for ($n = $n + 1; $n > 0; $n = intdiv($n - 1, 26)) $s = chr(65 + ($n - 1) % 26) . $s;
        return $s;
    };
    $esc = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES | ENT_XML1, 'UTF-8');
    $sheetRows = '';
    foreach ($rows as $ri => $row) {
        $rn = $ri + 1; $cells = '';
        foreach (array_values($row) as $ci => $val) {
            $ref = $colLetter($ci) . $rn;
            if (is_int($val) || is_float($val) || (is_string($val) && $val !== '' && preg_match('/^-?\d+$/', $val))) {
                $cells .= '<c r="' . $ref . '"><v>' . $esc($val) . '</v></c>';
            } else {
                $cells .= '<c r="' . $ref . '" t="inlineStr"><is><t xml:space="preserve">' . $esc($val) . '</t></is></c>';
            }
        }
        $sheetRows .= '<row r="' . $rn . '">' . $cells . '</row>';
    }
    $sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' . $sheetRows . '</sheetData></worksheet>';
    $contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
    $rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    $workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Отчёт" sheetId="1" r:id="rId1"/></sheets></workbook>';
    $wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
    $tmp = tempnam(sys_get_temp_dir(), 'xlsx');
    $zip = new ZipArchive();
    $zip->open($tmp, ZipArchive::OVERWRITE);
    $zip->addFromString('[Content_Types].xml', $contentTypes);
    $zip->addFromString('_rels/.rels', $rels);
    $zip->addFromString('xl/workbook.xml', $workbook);
    $zip->addFromString('xl/_rels/workbook.xml.rels', $wbRels);
    $zip->addFromString('xl/worksheets/sheet1.xml', $sheet);
    $zip->close();
    $bytes = (string)file_get_contents($tmp);
    @unlink($tmp);
    return $bytes;
}

if ($R('GET', '/admin/dashboard') !== null) {
    require_perm('dashboard.view');
    $now = time(); $today = venue_date_key($now);
    $from = day_start($today); $to = day_start(shift_key($today, 1));
    $mains = all_main_bookings();
    $todayList = array_values(array_filter($mains, fn($r) => ts_of($r['start_at']) >= $from && ts_of($r['start_at']) < $to && $r['status'] !== 'CANCELLED'));
    usort($todayList, fn($a, $b) => ts_of($a['start_at']) <=> ts_of($b['start_at']));
    $upcoming = array_values(array_filter($mains, fn($r) => in_array($r['status'], ACTIVE_STATUSES, true) && ts_of($r['start_at']) > $now));
    usort($upcoming, fn($a, $b) => ts_of($a['start_at']) <=> ts_of($b['start_at']));
    $live = array_values(array_filter($mains, fn($r) => in_array($r['status'], ACTIVE_STATUSES, true) && ts_of($r['start_at']) <= $now && ts_of($r['end_at']) > $now));
    out([
        'next' => $upcoming ? booking_view($upcoming[0], true) : null,
        'today' => array_map(fn($r) => booking_view($r, true), $todayList),
        'newCount' => count(array_filter($mains, fn($r) => $r['status'] === 'NEW' && ts_of($r['start_at']) > $now)),
        'live' => array_map(fn($r) => booking_view($r, true), $live),
        'todayRevenue' => array_sum(array_map(fn($r) => $r['status'] !== 'NO_SHOW' ? (int)$r['final_price'] : 0, $todayList)),
    ]);
}

if ($R('GET', '/admin/bookings/calendar') !== null) {
    require_perm('bookings.view');
    $from = day_start(s(q('from'))); $to = day_start(shift_key(s(q('to')), 1));
    $rows = array_values(array_filter(all_main_bookings(), fn($r) => in_array($r['status'], ['NEW', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'], true) && ts_of($r['start_at']) >= $from && ts_of($r['start_at']) < $to));
    usort($rows, fn($a, $b) => ts_of($a['start_at']) <=> ts_of($b['start_at']));
    out(array_map(fn($r) => booking_view($r, true), $rows));
}

if ($R('GET', '/admin/bookings') !== null && $path === '/admin/bookings') {
    require_perm('bookings.view');
    $statuses = array_values(array_filter(explode(',', s(q('status')))));
    $page = max(1, i(q('page'), 1)); $pageSize = min(200, max(1, i(q('pageSize'), 30)));
    $search = mb_strtolower(trim(s(q('q')))); $digits = preg_replace('/\D/', '', $search);
    $items = all_main_bookings();
    if ($statuses) $items = array_filter($items, fn($r) => in_array($r['status'], $statuses, true));
    if (q('questId')) $items = array_filter($items, fn($r) => $r['quest_id'] === q('questId'));
    if (q('from')) $items = array_filter($items, fn($r) => ts_of($r['start_at']) >= day_start(s(q('from'))));
    if (q('to')) $items = array_filter($items, fn($r) => ts_of($r['start_at']) < day_start(shift_key(s(q('to')), 1)));
    if ($search) $items = array_filter($items, function ($r) use ($search, $digits) {
        $u = find_user($r['user_id']); if (!$u) return false;
        $nameHit = mb_strpos(mb_strtolower((string)$u['name']), $search) !== false;
        $phoneHit = strlen($digits) >= 3 && strpos($u['phone'], strlen($digits) >= 10 ? substr($digits, -10) : $digits) !== false;
        return $nameHit || $phoneHit;
    });
    $items = array_values($items);
    usort($items, fn($a, $b) => q('sort') === 'asc' ? ts_of($a['start_at']) <=> ts_of($b['start_at']) : ts_of($b['start_at']) <=> ts_of($a['start_at']));
    $total = count($items);
    $slice = array_slice($items, ($page - 1) * $pageSize, $pageSize);
    out(['items' => array_map(fn($r) => booking_view($r, true), $slice), 'total' => $total, 'page' => $page, 'pageSize' => $pageSize]);
}

if (($p = $R('GET', '/admin/bookings/:id')) !== null) {
    require_perm('bookings.view');
    $b = find_booking($p['id']); if (!$b) not_found();
    out(booking_view($b, true) + ['recordings' => []]);
}

if ($R('POST', '/admin/bookings') !== null && $path === '/admin/bookings') {
    $me = require_perm('bookings.edit'); $b = body();
    $phone = phone_or_fail($b['phone'] ?? null);
    $quest = quest_by_id(s($b['questId'] ?? '')); if (!$quest) not_found('Квест не найден');
    $u = find_user_by_phone($phone);
    if (!$u) {
        $id = uid();
        db()->prepare('INSERT INTO users (id, phone, phone_verified, name, created_at) VALUES (?,?,0,?,?)')
            ->execute([$id, $phone, s($b['name'] ?? '') ?: null, now_iso()]);
        $u = find_user($id);
        admin_log($me['id'], 'user.create', 'User', $u['id'], ['phone' => $phone, 'name' => $u['name']]);
    }
    $row = create_booking($u, $quest, [
        'startAt' => s($b['startAt'] ?? ''), 'players' => i($b['playersCount'] ?? 0), 'ages' => $b['ages'] ?? [],
        'double' => !empty($b['double']), 'comment' => s($b['comment'] ?? '') ?: null, 'source' => $b['source'] ?? 'PHONE',
        'ignoreLead' => true, 'finalPrice' => array_key_exists('finalPrice', $b) ? i($b['finalPrice']) : null,
    ]);
    if (($b['confirm'] ?? true) !== false) $row = set_booking_status($row['id'], 'CONFIRMED');
    admin_log($me['id'], 'booking.create', 'Booking', $row['id'], $b);
    out(booking_view($row, true));
}

if (($p = $R('PATCH', '/admin/bookings/:id')) !== null) {
    $me = require_perm('bookings.edit');
    $b = find_booking($p['id']); if (!$b) not_found();
    $body = body();
    $quest = quest_by_id(s($body['questId'] ?? '') ?: $b['quest_id']); if (!$quest) not_found('Квест не найден');
    $startAt = !empty($body['startAt']) ? iso_of(ts_of(s($body['startAt']))) : $b['start_at'];
    $endAt = iso_of(ts_of($startAt) + $quest['durationMin'] * 60);
    if ((!empty($body['startAt']) || !empty($body['questId'])) && empty($body['force'])) {
        foreach (db()->query("SELECT * FROM bookings WHERE status IN ('NEW','CONFIRMED')")->fetchAll() as $x) {
            if ($x['id'] === $b['id'] || $x['id'] === $b['linked_booking_id'] || $x['quest_id'] !== $quest['id']) continue;
            if (overlaps(ts_of($x['start_at']), ts_of($x['end_at']), ts_of($startAt), ts_of($endAt))) {
                $cu = find_user($x['user_id']);
                fail(409, 'На это время уже есть запись', 'SLOT_TAKEN', ['clash' => ['id' => $x['id'], 'startAt' => $x['start_at'], 'name' => $cu['name'] ?? null]]);
            }
        }
    }
    $shift = ts_of($startAt) - ts_of($b['start_at']);
    if ($b['linked_booking_id'] && (!empty($body['startAt']) || !empty($body['questId']))) {
        $sec = find_booking($b['linked_booking_id']);
        if ($sec) {
            $ns = iso_of(ts_of($sec['start_at']) + $shift);
            db()->prepare('UPDATE bookings SET quest_id = ?, start_at = ?, end_at = ? WHERE id = ?')
                ->execute([$quest['id'], $ns, iso_of(ts_of($ns) + $quest['durationMin'] * 60), $sec['id']]);
        }
    }
    $base = array_key_exists('basePrice', $body) ? i($body['basePrice']) : (int)$b['base_price'];
    $percent = array_key_exists('discountPercent', $body) ? i($body['discountPercent']) : (int)$b['discount_percent'];
    $finalPrice = array_key_exists('finalPrice', $body) ? i($body['finalPrice'])
        : ((array_key_exists('basePrice', $body) || array_key_exists('discountPercent', $body)) ? (int)round($base * (1 - $percent / 100)) : (int)$b['final_price']);
    $ages = is_array($body['ages'] ?? null) ? array_values(array_filter(array_map('intval', $body['ages']), fn($n) => $n > 0)) : json_decode($b['ages'] ?: '[]', true);
    db()->prepare('UPDATE bookings SET quest_id=?, start_at=?, end_at=?, players_count=?, ages=?, base_price=?, discount_percent=?, discount_amount=?, final_price=?, comment=?, admin_note=? WHERE id=?')
        ->execute([
            $quest['id'], $startAt, $endAt,
            array_key_exists('playersCount', $body) ? i($body['playersCount']) : (int)$b['players_count'],
            json_encode($ages, JSON_UNESCAPED_UNICODE), $base, $percent, $base - $finalPrice, $finalPrice,
            array_key_exists('comment', $body) ? ($body['comment'] !== null ? s($body['comment']) : null) : $b['comment'],
            array_key_exists('adminNote', $body) ? ($body['adminNote'] !== null ? s($body['adminNote']) : null) : $b['admin_note'],
            $b['id'],
        ]);
    admin_log($me['id'], 'booking.update', 'Booking', $b['id'], ['changes' => $body]);
    out(booking_view(find_booking($b['id']), true));
}

if (($p = $R('POST', '/admin/bookings/:id/status')) !== null) {
    $me = require_perm('bookings.edit'); $b = body();
    $status = s($b['status'] ?? '');
    if (!in_array($status, ['NEW', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'], true)) fail(400, 'Некорректный статус', 'VALIDATION');
    $extra = [];
    if (array_key_exists('passed', $b)) $extra['passed'] = $b['passed'] === null ? null : ($b['passed'] ? 1 : 0);
    if (array_key_exists('timeSpentMin', $b)) $extra['timeSpentMin'] = $b['timeSpentMin'] === null ? null : i($b['timeSpentMin']);
    $row = set_booking_status($p['id'], $status, $extra);
    admin_log($me['id'], 'booking.status', 'Booking', $row['id'], $b);
    out(booking_view($row, true));
}

/* ---- админка: пользователи ---- */

function admin_user_row(array $u, bool $showRoles): array {
    $pdo = db();
    $cnt = $pdo->prepare('SELECT COUNT(*) FROM bookings WHERE user_id = ?'); $cnt->execute([$u['id']]);
    $ns = $pdo->prepare("SELECT COUNT(*) FROM bookings WHERE user_id = ? AND status = 'NO_SHOW'"); $ns->execute([$u['id']]);
    $role = effective_role($u);
    return [
        'id' => $u['id'], 'name' => $u['name'], 'phone' => $u['phone'], 'phoneVerified' => (bool)$u['phone_verified'],
        'email' => $u['email'], 'points' => (int)$u['points'], 'blocked' => (bool)$u['blocked'],
        'createdAt' => $u['created_at'], 'lastVisitAt' => $u['last_visit_at'],
        'bookingsCount' => (int)$cnt->fetchColumn(), 'noShows' => (int)$ns->fetchColumn(),
        'role' => $showRoles && $role ? ['key' => $role, 'name' => role_def($role)['name'] ?? $role] : null,
    ];
}

if ($R('GET', '/admin/users') !== null && $path === '/admin/users') {
    $me = require_perm('users.view');
    $showRoles = can($me, 'roles.manage');
    $search = mb_strtolower(trim(s(q('q')))); $digits = preg_replace('/\D/', '', $search);
    $rows = db()->query('SELECT * FROM users ORDER BY created_at DESC')->fetchAll();
    if ($search) $rows = array_filter($rows, function ($u) use ($search, $digits) {
        $hit = mb_strpos(mb_strtolower((string)$u['name']), $search) !== false || mb_strpos(mb_strtolower((string)$u['email']), $search) !== false;
        $ph = strlen($digits) >= 3 && strpos($u['phone'], strlen($digits) >= 10 ? substr($digits, -10) : $digits) !== false;
        return $hit || $ph;
    });
    if (q('blocked') !== null && q('blocked') !== '') $rows = array_filter($rows, fn($u) => (bool)$u['blocked'] === (q('blocked') === 'true'));
    $rows = array_values($rows);
    $page = max(1, i(q('page'), 1)); $total = count($rows);
    out(['total' => $total, 'page' => $page, 'pageSize' => 30, 'items' => array_map(fn($u) => admin_user_row($u, $showRoles), array_slice($rows, ($page - 1) * 30, 30))]);
}

if (($p = $R('GET', '/admin/users/:id')) !== null) {
    $me = require_perm('users.view');
    $u = find_user($p['id']); if (!$u) not_found();
    $showRoles = can($me, 'roles.manage');
    $bk = db()->prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY start_at DESC'); $bk->execute([$u['id']]);
    $bookings = array_map(fn($r) => ['id' => $r['id'], 'startAt' => $r['start_at'], 'status' => $r['status'], 'finalPrice' => (int)$r['final_price'], 'quest' => ['title' => quest_by_id($r['quest_id'])['title'] ?? null]], $bk->fetchAll());
    $pl = db()->prepare('SELECT * FROM points_log WHERE user_id = ? ORDER BY created_at DESC'); $pl->execute([$u['id']]);
    out(admin_user_row($u, $showRoles) + ['birthDate' => $u['birth_date'], 'bookings' => $bookings, 'pointsLog' => $pl->fetchAll()]);
}

if (($p = $R('POST', '/admin/users/:id/block')) !== null) {
    $me = require_perm('users.edit');
    $u = find_user($p['id']); if (!$u) not_found();
    $blocked = !empty(body()['blocked']) ? 1 : 0;
    db()->prepare('UPDATE users SET blocked = ? WHERE id = ?')->execute([$blocked, $u['id']]);
    admin_log($me['id'], 'user.block', 'User', $u['id'], ['blocked' => (bool)$blocked]);
    out(serialize_user(find_user($u['id'])));
}

if (($p = $R('POST', '/admin/users/:id/verify-phone')) !== null) {
    $me = require_perm('users.edit');
    $u = find_user($p['id']); if (!$u) not_found();
    db()->prepare('UPDATE users SET phone_verified = 1 WHERE id = ?')->execute([$u['id']]);
    admin_log($me['id'], 'user.verify', 'User', $u['id']);
    out(['ok' => true]);
}

if (($p = $R('POST', '/admin/users/:id/points')) !== null) {
    $me = require_perm('points.edit');
    $u = find_user($p['id']); if (!$u) not_found();
    $b = body(); $delta = i($b['delta'] ?? 0);
    if (!$delta) fail(400, 'Укажите изменение баллов', 'VALIDATION');
    $newPoints = max(0, (int)$u['points'] + $delta);
    db()->prepare('UPDATE users SET points = ? WHERE id = ?')->execute([$newPoints, $u['id']]);
    db()->prepare('INSERT INTO points_log (id, user_id, delta, reason, comment, booking_id, created_at) VALUES (?,?,?,?,?,?,?)')
        ->execute([uid(), $u['id'], $delta, 'ADMIN', s($b['comment'] ?? '') ?: null, null, now_iso()]);
    admin_log($me['id'], 'user.points', 'User', $u['id'], ['delta' => $delta]);
    out(['ok' => true, 'points' => $newPoints]);
}

/* ---- админка: роли, настройки, квесты, журнал, прочее (чтение) ---- */

if ($R('GET', '/admin/roles') !== null) {
    require_perm('roles.manage');
    $owners = (array)cfg('owner_phones', []);
    $users = db()->query('SELECT id, name, phone, role_key FROM users')->fetchAll();
    $roles = [];
    foreach (data_all()['roles'] as $key => $r) {
        $perms = ($r['permissions'] ?? null) === '*' ? all_perms() : array_values((array)($r['permissions'] ?? []));
        $members = array_values(array_filter($users, function ($u) use ($key, $owners) {
            $eff = in_array($u['phone'] ?? '', $owners, true) ? 'owner' : ($u['role_key'] ?: null);
            return $eff === $key;
        }));
        $roles[] = [
            'key' => $key, 'name' => $r['name'], 'permissions' => $perms,
            'users' => array_map(fn($u) => ['id' => $u['id'], 'name' => $u['name'], 'phone' => $u['phone']], $members),
        ];
    }
    out(['roles' => $roles, 'permissions' => perm_labels()]);
}

if (($p = $R('PUT', '/admin/roles/:key')) !== null) {
    $me = require_perm('roles.manage');
    $key = $p['key'];
    if ($key === 'owner') fail(403, 'Права главного администратора не редактируются', 'FORBIDDEN');
    if (!array_key_exists($key, data_all()['roles'])) not_found('Роль не найдена');
    $valid = all_perms();
    $perms = array_values(array_filter((array)(body()['permissions'] ?? []), fn($x) => in_array($x, $valid, true) && $x !== 'roles.manage'));
    $st = db()->prepare('SELECT v FROM kv_store WHERE k = ?'); $st->execute(['data_overrides']);
    $over = json_decode((string)($st->fetchColumn() ?: 'null'), true);
    $rolesOver = (is_array($over) && is_array($over['roles'] ?? null)) ? $over['roles'] : [];
    $rolesOver[$key] = $perms;
    data_save_override('roles', $rolesOver);
    admin_log($me['id'], 'role.update', 'Role', $key, ['permissions' => $perms]);
    out(['key' => $key, 'name' => data_all()['roles'][$key]['name'], 'permissions' => $perms]);
}

if ($R('GET', '/admin/settings') !== null) {
    require_perm('dashboard.view');
    $d = data_all();
    out([
        'site' => $d['site'], 'contacts' => $d['contacts'],
        'booking' => $d['booking'], 'loyalty' => $d['loyalty'],
        'recordings' => $d['recordings'], 'extras' => $d['extras'],
    ]);
}

if (($p = $R('PUT', '/admin/settings/:key')) !== null) {
    $me = require_user();
    $key = $p['key'];
    if (!in_array($key, ['site', 'contacts', 'booking', 'loyalty', 'recordings'], true)) not_found('Раздел не найден');
    $need = ($key === 'site' || $key === 'contacts') ? 'content.edit' : 'settings.edit';
    if (!can($me, $need)) forbidden();
    $current = is_array(data_all()[$key] ?? null) ? data_all()[$key] : [];
    $patch = body();
    $merged = array_merge($current, $patch);
    data_save_override($key, $merged);
    admin_log($me['id'], 'settings.update', 'Setting', $key, $patch);
    out($merged);
}

if ($R('GET', '/admin/quests') !== null) {
    require_perm('quests.edit');
    out(array_map(function ($q) {
        $sch = $q['_schedule'] ?? ['from' => '10:00', 'to' => '22:00', 'break' => 20];
        $schedules = array_map(fn($wd) => [
            'weekday' => $wd, 'timeFrom' => $sch['from'], 'timeTo' => $sch['to'], 'breakMin' => (int)$sch['break'],
        ], [0, 1, 2, 3, 4, 5, 6]);
        return public_quest($q) + [
            'roomNumber' => $q['roomNumber'], 'isActive' => $q['isActive'], 'sortOrder' => $q['sortOrder'],
            'schedules' => $schedules,
        ];
    }, quests_all()));
}

if ($R('GET', '/admin/logs') !== null) {
    require_perm('logs.view');
    $page = max(1, i(q('page'), 1)); $pageSize = 50; $offset = ($page - 1) * $pageSize;
    $total = (int)db()->query('SELECT COUNT(*) FROM admin_logs')->fetchColumn();
    $rows = db()->query("SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT $pageSize OFFSET $offset")->fetchAll();
    $umap = [];
    foreach (db()->query('SELECT id, name, phone FROM users')->fetchAll() as $u) $umap[$u['id']] = $u;
    $items = array_map(function ($l) use ($umap) {
        $a = $umap[$l['admin_id']] ?? null;
        return [
            'id' => $l['id'], 'adminId' => $l['admin_id'], 'action' => $l['action'],
            'entity' => $l['entity'], 'entityId' => $l['entity_id'],
            'details' => json_decode($l['details'] ?: 'null', true), 'createdAt' => $l['created_at'],
            'admin' => ['name' => $a['name'] ?? null, 'phone' => $a['phone'] ?? ''],
        ];
    }, $rows);
    out(['items' => $items, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize]);
}

if ($R('GET', '/admin/payments') !== null) { require_perm('payments.view'); out(['items' => [], 'total' => 0, 'page' => 1, 'pageSize' => 30]); }
if ($R('GET', '/admin/promocodes') !== null) { require_perm('promo.edit'); out([]); }
if ($R('GET', '/admin/recordings') !== null) { require_perm('recordings.manage'); out(['items' => [], 'total' => 0]); }

if ($R('GET', '/admin/reports') !== null) {
    require_perm('reports.view');
    $today = venue_date_key(time());
    out(report_data(s(q('from')) ?: $today, s(q('to')) ?: $today));
}

if ($R('GET', '/admin/reports/export') !== null) {
    require_perm('reports.view');
    $today = venue_date_key(time());
    $fromKey = s(q('from')) ?: $today; $toKey = s(q('to')) ?: $today;
    $rep = report_data($fromKey, $toKey);
    $rows = [
        ['Показатель', 'Значение'],
        ['Период', $fromKey . ' — ' . $toKey],
        ['Выручка, руб', $rep['revenue']],
        ['Средний чек, руб', $rep['avgCheck']],
        ['Заявок', $rep['bookings']],
        ['Завершено', $rep['completed']],
        ['Отмены', $rep['cancelled']],
        ['Неявки', $rep['noShows']],
        ['Впереди', $rep['upcoming']],
        ['Конверсия, %', $rep['conversion']],
        [],
        ['Выручка по дням'],
        ['Дата', 'Заявок', 'Выручка, руб'],
    ];
    foreach ($rep['byDay'] as $d) $rows[] = [$d['date'], $d['bookings'], $d['revenue']];
    $rows[] = [];
    $rows[] = ['Загрузка по квестам'];
    $rows[] = ['Квест', 'Сеансов', 'Слотов', 'Загрузка, %', 'Игроков', 'Выручка, руб'];
    foreach ($rep['byQuest'] as $qq) $rows[] = [$qq['title'], $qq['sessions'], $qq['totalSlots'], $qq['load'], $qq['players'], $qq['revenue']];

    $format = s(q('format')) === 'csv' ? 'csv' : 'xlsx';
    header_remove('Content-Type');
    header('Cache-Control: no-store');
    if ($format === 'xlsx' && class_exists('ZipArchive')) {
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        echo xlsx_build($rows);
        exit;
    }
    header('Content-Type: text/csv; charset=utf-8');
    $csv = "\xEF\xBB\xBF"; // BOM — чтобы Excel правильно распознал кириллицу
    foreach ($rows as $r) {
        $cells = array_map(function ($v) {
            $v = (string)$v;
            if (preg_match('/[";\n\r]/', $v)) $v = '"' . str_replace('"', '""', $v) . '"';
            return $v;
        }, $r);
        $csv .= implode(';', $cells) . "\r\n";
    }
    echo $csv;
    exit;
}

/* ============================================================ */
not_found('Метод не найден');
