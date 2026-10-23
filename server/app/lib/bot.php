<?php
// Чат-бот: обработка сообщений из EventSub — модерация, команды, заказ музыки, розыгрыши.

const KNOWN_BOTS = ['nightbot', 'streamelements', 'moobot', 'streamlabs', 'fossabot', 'wizebot', 'sery_bot', 'soundalerts', 'kofistreambot'];

// ---------- настройки по умолчанию ----------
function mod_defaults(): array {
    return [
        'auto' => true,
        'exempt' => ['mods' => true, 'vip' => true, 'subs' => false],
        'ladder' => [['a' => 'warn'], ['a' => 'warn'], ['a' => 'warn'], ['a' => 'ban']],
        'resetDays' => 7,
        'warnText' => '@{user}, {reason}. Предупреждение {n} из {max}',
        'announce' => true,
        'filters' => [
            'tox' => ['on' => true, 'action' => 'review', 'dur' => 600, 'sens' => 2],
            'threat' => ['on' => true, 'action' => 'ban', 'dur' => 86400, 'sens' => 3],
            'caps' => ['on' => true, 'action' => 'ladder', 'dur' => 60, 'min' => 12, 'pct' => 70],
            'links' => ['on' => true, 'action' => 'warn', 'dur' => 60],
            'spam' => ['on' => true, 'action' => 'timeout', 'dur' => 300, 'repeats' => 3, 'window' => 30],
            'flood' => ['on' => true, 'action' => 'delete', 'dur' => 60, 'emotes' => 8, 'chars' => 10],
            'words' => ['on' => true, 'action' => 'ladder', 'dur' => 600],
            'bots' => ['on' => true, 'action' => 'ban', 'dur' => 0],
            'promo' => ['on' => true, 'action' => 'timeout', 'dur' => 600],
            'personal' => ['on' => true, 'action' => 'delete', 'dur' => 60],
            'zalgo' => ['on' => true, 'action' => 'delete', 'dur' => 60],
            'mentions' => ['on' => false, 'action' => 'timeout', 'dur' => 60, 'max' => 5],
            'long' => ['on' => false, 'action' => 'delete', 'dur' => 60, 'max' => 400],
            'newacc' => ['on' => false, 'action' => 'review', 'dur' => 60, 'days' => 7],
        ],
        'words' => ['скины бесплатно', 'free followers', 'cheap viewers'],
        'domains' => ['clips.twitch.tv', 'twitch.tv', 'youtube.com', 'youtu.be', 'music.yandex.ru', '7tv.app'],
        'subsLinks' => true,
        'permit' => true,
    ];
}

function mod_config(int $uid): array {
    $d = mod_defaults();
    $c = settings_get($uid, 'mod', []);
    $out = array_replace_recursive($d, is_array($c) ? $c : []);
    if (isset($c['ladder'])) $out['ladder'] = $c['ladder'];
    if (isset($c['words'])) $out['words'] = $c['words'];
    if (isset($c['domains'])) $out['domains'] = $c['domains'];
    $out['exempt']['mods'] = true; // модераторы канала всегда в исключениях, даже если в старых настройках стоит «нет»
    return $out;
}

function music_defaults(): array {
    return [
        'open' => true,
        'auto' => true, // автовоспроизведение: очередь пуста — подбираем похожие треки (music_auto.php)
        'mix' => 'mixed', // стиль подбора: similar — похожее, mixed — вперемешку, discover — новое
        'cmd' => ['on' => true, 'name' => 'музыка', 'access' => 'followers', 'cooldown' => 60],
        'points' => ['on' => false, 'cost' => 500, 'rewardId' => null],
        'donate' => ['on' => false, 'min' => 100],
        'search' => true,
        'maxLen' => 360, 'perUser' => 2, 'minViews' => 1000, 'manual' => false,
        'stop' => ['ear rape', '10 часов', 'bass boosted'],
        'volume' => 70,
    ];
}

function music_config(int $uid): array {
    $c = settings_get($uid, 'music', []);
    $out = array_replace_recursive(music_defaults(), is_array($c) ? $c : []);
    if (isset($c['stop'])) $out['stop'] = $c['stop'];
    return $out;
}

// ---------- роли ----------
function chat_roles(array $badges, string $login, string $broadcasterLogin): array {
    $set = [];
    foreach ($badges as $b) $set[$b['set_id'] ?? ''] = true;
    $isBroadcaster = isset($set['broadcaster']) || strtolower($login) === strtolower($broadcasterLogin);
    $isMod = $isBroadcaster || isset($set['moderator']);
    return [
        'broadcaster' => $isBroadcaster, 'mod' => $isMod, 'vip' => isset($set['vip']),
        'sub' => isset($set['subscriber']) || isset($set['founder']),
        'bot' => in_array(strtolower($login), array_merge(KNOWN_BOTS, [strtolower((string)(bot_account()['login'] ?? ''))]), true),
    ];
}

function role_label(array $r): string {
    if ($r['broadcaster']) return 'стример';
    if ($r['mod']) return 'модератор';
    if ($r['vip']) return 'VIP';
    if ($r['sub']) return 'подписчик';
    return 'зритель';
}

function is_follower(array $user, string $chatterId): bool {
    $row = db_one('SELECT since, checked_at FROM follow_cache WHERE user_id = ? AND chatter_id = ?', [$user['id'], $chatterId]);
    if ($row && (int)$row['checked_at'] > now() - 6 * 3600) return (int)$row['since'] > 0;
    $b = bot_account();
    $since = 0;
    if ($b) {
        $r = bot_helix('GET', 'channels/followers', ['broadcaster_id' => $user['twitch_id'], 'user_id' => $chatterId]);
        if (!empty($r['json']['data'][0]['followed_at'])) $since = strtotime($r['json']['data'][0]['followed_at']) ?: 1;
        if ($r['code'] !== 200) return true; // нет прав на проверку — не наказываем зрителя
    }
    db_exec('DELETE FROM follow_cache WHERE user_id = ? AND chatter_id = ?', [$user['id'], $chatterId]);
    db_insert('follow_cache', ['user_id' => $user['id'], 'chatter_id' => $chatterId, 'since' => $since, 'checked_at' => now()]);
    return $since > 0;
}

function account_age_days(string $chatterId): ?int {
    $k = 'acct:' . $chatterId;
    $c = kv_get($k);
    if ($c === null) {
        $r = helix('GET', 'users', ['id' => $chatterId]);
        $created = $r['json']['data'][0]['created_at'] ?? null;
        $c = $created ? strtotime($created) : 0;
        kv_set($k, $c, 86400);
    }
    return $c ? intdiv(now() - (int)$c, 86400) : null;
}

function access_ok(array $user, string $access, array $roles, string $chatterId, string $login, string $allowList = ''): bool {
    if ($roles['broadcaster']) return true;
    switch ($access) {
        case 'mods': return $roles['mod'];
        case 'vip': return $roles['mod'] || $roles['vip'];
        case 'subs': return $roles['mod'] || $roles['vip'] || $roles['sub'];
        case 'followers': return $roles['mod'] || $roles['vip'] || $roles['sub'] || is_follower($user, $chatterId);
        case 'list':
            $list = array_filter(array_map(fn($s) => strtolower(trim($s, " @\t")), preg_split('/[,\s]+/', $allowList)));
            return $roles['mod'] || in_array(strtolower($login), $list, true);
        default: return true;
    }
}

// ---------- вход: сообщение чата ----------
function bot_handle_message(array $user, array $ev): void {
    $b = bot_account();
    $chatterId = (string)$ev['chatter_user_id'];
    $login = (string)$ev['chatter_user_login'];
    $name = (string)($ev['chatter_user_name'] ?? $login);
    $text = trim((string)($ev['message']['text'] ?? ''));
    $msgId = (string)$ev['message_id'];
    $badges = $ev['badges'] ?? [];
    $roles = chat_roles($badges, $login, $user['login']);

    db_insert('chat_messages', [
        'user_id' => $user['id'], 'msg_id' => $msgId, 'chatter_id' => $chatterId, 'chatter_login' => $login, 'chatter_name' => $name,
        'text' => mb_substr($text, 0, 500), 'badges' => json_encode(array_map(fn($b) => ($b['set_id'] ?? '') . '/' . ($b['id'] ?? ''), $badges)),
        'frags' => json_encode(chat_frags($ev['message']['fragments'] ?? []), JSON_UNESCAPED_UNICODE), 'color' => $ev['color'] ?? '', 'created_at' => now(),
    ]);
    if ($b && $chatterId === (string)$b['id']) return; // свои сообщения не обрабатываем

    // чёрный список StreOps: сообщение удаляем, человека банем в этом канале, дальше не обрабатываем
    if (bl_enforce($user, $chatterId, $login, $msgId)) return;

    $ctx = ['user' => $user, 'chatterId' => $chatterId, 'login' => $login, 'name' => $name, 'text' => $text, 'msgId' => $msgId, 'roles' => $roles, 'fragments' => $ev['message']['fragments'] ?? []];

    if (moderate($ctx)) return;
    giveaway_entry($ctx);
    if (handle_builtin($ctx)) return;
    handle_command($ctx);
}

// ---------- модерация ----------
function mod_wordlist(string $kind, int $sens): array {
    // Словарные фильтры: чем выше чувствительность, тем шире список. Это не ИИ, а основа, которую можно расширять своими словами.
    $tox = [
        1 => ['пидор', 'пидр', 'хуесос', 'уебок', 'уёбок', 'шлюха', 'чмо'],
        2 => ['долбоеб', 'долбоёб', 'дебил', 'даун', 'урод', 'мразь', 'тварь', 'ублюдок', 'гнида', 'idiot', 'retard', 'faggot'],
        3 => ['тупой', 'тупица', 'идиот', 'кретин', 'лох', 'клоун', 'бездарь', 'stupid', 'loser'],
        4 => ['удали игру', 'ты ноль', 'позорище', 'отстой'],
    ];
    $threat = [
        1 => ['убью тебя', 'найду тебя', 'вычислю по ip', 'kill yourself', 'kys'],
        2 => ['убить тебя', 'тебе конец', 'сдохни', 'выпились'],
        3 => ['приеду к тебе', 'знаю где ты живешь', 'знаю где ты живёшь'],
        4 => ['ответишь за это'],
    ];
    $src = $kind === 'tox' ? $tox : $threat;
    $out = [];
    for ($i = 1; $i <= max(1, min(4, $sens)); $i++) $out = array_merge($out, $src[$i]);
    return $out;
}

function norm_text(string $t): string {
    $t = mb_strtolower($t);
    $map = ['0' => 'о', '3' => 'з', '4' => 'ч', '6' => 'б', '@' => 'а', 'a' => 'а', 'e' => 'е', 'o' => 'о', 'p' => 'р', 'c' => 'с', 'y' => 'у', 'x' => 'х', 'k' => 'к', 'ё' => 'е'];
    $t = strtr($t, $map);
    return preg_replace('/[\s\.\-_\*]+/u', '', $t) ?? $t;
}

function text_has_any(string $text, array $words): ?string {
    $low = mb_strtolower($text);
    $norm = norm_text($text);
    foreach ($words as $w) {
        $w = trim(mb_strtolower((string)$w));
        if ($w === '') continue;
        if (str_contains($w, '*')) {
            $re = '/' . str_replace('\*', '.*', preg_quote($w, '/')) . '/u';
            if (preg_match($re, $low)) return $w;
            continue;
        }
        if (str_contains($low, $w) || str_contains($norm, norm_text($w))) return $w;
    }
    return null;
}

function moderate(array $ctx): bool {
    $user = $ctx['user'];
    $cfg = mod_config((int)$user['id']);
    if (empty($cfg['auto'])) return false;
    $r = $ctx['roles'];
    // стример, бот StreOps и модераторы канала не проверяются никогда: это не настраивается
    if ($r['broadcaster'] || $r['bot'] || $r['mod']) return false;
    if ($r['vip'] && !empty($cfg['exempt']['vip'])) return false;
    if ($r['sub'] && !empty($cfg['exempt']['subs'])) return false;

    $text = $ctx['text'];
    $f = $cfg['filters'];
    $hit = null; // [filterKey, reason]

    if (!empty($f['threat']['on']) && ($w = text_has_any($text, mod_wordlist('threat', (int)$f['threat']['sens'])))) $hit = ['threat', 'угрозы в чате'];
    if (!$hit && !empty($f['tox']['on']) && ($w = text_has_any($text, mod_wordlist('tox', (int)$f['tox']['sens'])))) $hit = ['tox', 'оскорбления'];
    if (!$hit && !empty($f['words']['on']) && text_has_any($text, $cfg['words'] ?? [])) $hit = ['words', 'запрещённое слово'];
    if (!$hit && !empty($f['bots']['on']) && preg_match('~(cheap\s*viewers|best\s*viewers|dogehype|streamboo|followers?\s*(and|&)\s*viewers|бесплатн\w*\s+зрител)~iu', $text)) $hit = ['bots', 'спам-бот'];
    if (!$hit && !empty($f['links']['on']) && preg_match_all('~\b((?:https?://)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:/\S*)?)~iu', $text, $m)) {
        $permit = kv_get('permit:' . $user['id'] . ':' . $ctx['chatterId']);
        $subsOk = !empty($cfg['subsLinks']) && ($r['sub'] || $r['vip']);
        if (!$permit && !$subsOk) {
            foreach ($m[1] as $url) {
                $host = strtolower((string)parse_url(str_contains($url, '://') ? $url : 'http://' . $url, PHP_URL_HOST));
                $host = preg_replace('/^www\./', '', $host);
                $allowed = false;
                foreach ($cfg['domains'] ?? [] as $d) {
                    $d = strtolower(preg_replace('~^https?://|^www\.|/.*$~', '', trim($d)));
                    if ($d && ($host === $d || str_ends_with($host, '.' . $d) || str_starts_with(strtolower($url), $d))) { $allowed = true; break; }
                }
                if (!$allowed && preg_match('/\.[a-z]{2,}$/', $host)) { $hit = ['links', 'ссылки без разрешения']; break; }
            }
        }
    }
    if (!$hit && !empty($f['promo']['on']) && preg_match('~(заходи(те)?\s+(ко\s+мне|на\s+мой)|подпиш(ись|итесь)\s+на\s+мой|мой\s+канал|follow\s+me|check\s+out\s+my\s+(channel|stream))~iu', $text)) $hit = ['promo', 'самопиар'];
    if (!$hit && !empty($f['personal']['on']) && preg_match('~(\+?[78][\s\-(]*\d{3}[\s\-)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}|\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b)~u', $text)) $hit = ['personal', 'личные данные'];
    if (!$hit && !empty($f['zalgo']['on']) && preg_match('/[\x{0300}-\x{036F}]{3,}|[\x{200B}-\x{200F}\x{2060}]{2,}/u', $text)) $hit = ['zalgo', 'мусорные символы'];
    if (!$hit && !empty($f['caps']['on'])) {
        $letters = preg_replace('/[^\p{L}]/u', '', $text);
        $len = mb_strlen($letters);
        if ($len >= (int)$f['caps']['min']) {
            $up = mb_strlen(preg_replace('/[^\p{Lu}]/u', '', $letters));
            if ($up / max(1, $len) * 100 >= (int)$f['caps']['pct']) $hit = ['caps', 'без капса, пожалуйста'];
        }
    }
    if (!$hit && !empty($f['flood']['on'])) {
        $emotes = count(array_filter($ctx['fragments'], fn($fr) => ($fr['type'] ?? '') === 'emote'));
        if ($emotes > (int)$f['flood']['emotes'] || preg_match('/(.)\1{' . max(3, (int)$f['flood']['chars'] - 1) . ',}/u', $text)) $hit = ['flood', 'флуд'];
    }
    if (!$hit && !empty($f['mentions']['on']) && substr_count($text, '@') > (int)$f['mentions']['max']) $hit = ['mentions', 'массовые упоминания'];
    if (!$hit && !empty($f['long']['on']) && mb_strlen($text) > (int)$f['long']['max']) $hit = ['long', 'слишком длинное сообщение'];
    if (!$hit && !empty($f['spam']['on'])) {
        $since = now() - max(5, (int)$f['spam']['window']);
        $same = db_one('SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ? AND chatter_id = ? AND created_at >= ? AND text = ?', [$user['id'], $ctx['chatterId'], $since, mb_substr($text, 0, 500)]);
        if ((int)$same['c'] >= (int)$f['spam']['repeats']) $hit = ['spam', 'спам повторами'];
    }
    if (!$hit && !empty($f['newacc']['on'])) {
        $age = account_age_days($ctx['chatterId']);
        if ($age !== null && $age < (int)$f['newacc']['days']) $hit = ['newacc', 'новый аккаунт'];
    }
    if (!$hit) return false;

    $rule = $f[$hit[0]];
    return punish($ctx, $cfg, (string)$rule['action'], (int)($rule['dur'] ?? 60), $hit[1]);
}

function punish(array $ctx, array $cfg, string $action, int $dur, string $reason): bool {
    $user = $ctx['user'];
    $bid = $user['twitch_id'];
    $strikesLabel = '';
    if ($action === 'ladder') {
        $ladder = $cfg['ladder'] ?: [['a' => 'warn']];
        $row = db_one('SELECT cnt, last_at FROM strikes WHERE user_id = ? AND chatter_id = ?', [$user['id'], $ctx['chatterId']]);
        $cnt = $row ? (int)$row['cnt'] : 0;
        if ($row && (int)$cfg['resetDays'] > 0 && (int)$row['last_at'] < now() - (int)$cfg['resetDays'] * 86400) $cnt = 0;
        $cnt++;
        db_exec('DELETE FROM strikes WHERE user_id = ? AND chatter_id = ?', [$user['id'], $ctx['chatterId']]);
        db_insert('strikes', ['user_id' => $user['id'], 'chatter_id' => $ctx['chatterId'], 'cnt' => $cnt, 'last_at' => now()]);
        $step = $ladder[min($cnt, count($ladder)) - 1];
        $action = (string)$step['a'];
        $dur = isset($step['d']) ? parse_dur((string)$step['d']) : $dur;
        $strikesLabel = $cnt . ' из ' . count($ladder);
        // «Предупреждение 2 из 3»: считаем только ступени-предупреждения, а не всю лестницу
        $warnSteps = array_keys(array_filter($ladder, fn($s) => ($s['a'] ?? '') === 'warn'));
        $ctx['strikeN'] = count(array_filter($warnSteps, fn($i) => $i < $cnt)) ?: 1;
        $ctx['strikeMax'] = max(1, count($warnSteps));
    }
    $ok = true;
    switch ($action) {
        case 'review':
            db_insert('review_queue', ['user_id' => $user['id'], 'msg_id' => $ctx['msgId'], 'chatter_id' => $ctx['chatterId'], 'chatter_login' => $ctx['login'], 'text' => $ctx['text'], 'reason' => $reason, 'status' => 'new', 'created_at' => now()]);
            log_action($user, $ctx, 'review', $reason, 0, 'Бот', $strikesLabel);
            return false;
        case 'delete':
            $ok = tw_delete_message($bid, $ctx['msgId']);
            break;
        case 'warn':
            $ok = tw_delete_message($bid, $ctx['msgId']);
            $tpl = (string)($cfg['warnText'] ?? '@{user}, {reason}');
            tw_send($bid, strtr($tpl, ['{user}' => $ctx['name'], '{reason}' => $reason, '{n}' => (string)($ctx['strikeN'] ?? 1), '{max}' => (string)($ctx['strikeMax'] ?? 1)]));
            break;
        case 'timeout':
            $ok = tw_ban($bid, $ctx['chatterId'], max(1, $dur), 'StreOps: ' . $reason);
            if (!empty($cfg['announce'])) tw_send($bid, '@' . $ctx['name'] . ' — мут на ' . human_dur($dur) . ': ' . $reason);
            break;
        case 'ban':
            $ok = tw_ban($bid, $ctx['chatterId'], 0, 'StreOps: ' . $reason);
            break;
    }
    db_exec('UPDATE chat_messages SET deleted = 1 WHERE user_id = ? AND msg_id = ?', [$user['id'], $ctx['msgId']]);
    log_action($user, $ctx, $action, $reason, $action === 'timeout' ? $dur : 0, 'Бот', $strikesLabel);
    if (!$ok) logline('mod', "{$user['login']}: $action failed for {$ctx['login']} (бот не модератор?)");
    return true;
}

function parse_dur(string $s): int {
    $map = ['30 с' => 30, '1 мин' => 60, '5 мин' => 300, '10 мин' => 600, '1 ч' => 3600, '24 ч' => 86400, '7 дней' => 604800];
    if (isset($map[$s])) return $map[$s];
    if (preg_match('/^(\d+)\s*([smhd])$/i', trim($s), $m)) return (int)$m[1] * ['s' => 1, 'm' => 60, 'h' => 3600, 'd' => 86400][strtolower($m[2])];
    return max(1, (int)$s);
}

function human_dur(int $s): string {
    if ($s >= 86400 && $s % 86400 === 0) return ($s / 86400) . ' дн.';
    if ($s >= 3600 && $s % 3600 === 0) return ($s / 3600) . ' ч';
    if ($s >= 60) return intdiv($s, 60) . ' мин';
    return $s . ' с';
}

function log_action(array $user, array $ctx, string $action, string $reason, int $dur, string $by, string $strikes = ''): void {
    db_insert('mod_actions', [
        'user_id' => $user['id'], 'chatter_id' => $ctx['chatterId'], 'chatter_login' => $ctx['login'], 'action' => $action, 'reason' => $reason,
        'duration' => $dur, 'by_login' => $by, 'message' => mb_substr((string)($ctx['text'] ?? ''), 0, 500), 'strikes' => $strikes, 'created_at' => now(),
    ]);
}

// ---------- встроенные команды ----------
function handle_builtin(array $ctx): bool {
    $user = $ctx['user'];
    $text = $ctx['text'];
    if ($text === '' || !preg_match('/^(\S+)\s*(.*)$/su', $text, $m)) return false;
    $word = mb_strtolower($m[1]);
    $arg = trim($m[2]);
    $bid = $user['twitch_id'];
    $r = $ctx['roles'];

    // заказ музыки
    $music = music_config((int)$user['id']);
    if (!empty($music['cmd']['on']) && $word === '!' . mb_strtolower((string)$music['cmd']['name'])) {
        if (!plan_limits($user)['music']) return true; // на бесплатном тарифе молчим: публичный чат не засоряем, пояснение — в панели
        if (!access_ok($user, (string)$music['cmd']['access'], $r, $ctx['chatterId'], $ctx['login'])) return true;
        $ck = 'music:' . $user['id'] . ':' . $ctx['chatterId'];
        $last = db_one('SELECT last FROM cooldowns WHERE k = ?', [$ck]);
        if ($last && !$r['mod'] && (int)$last['last'] > now() - (int)$music['cmd']['cooldown']) return true;
        set_cooldown($ck);
        $res = song_request($user, $arg, $ctx['name'], 'command');
        tw_send($bid, '@' . $ctx['name'] . ' ' . $res['message'], $ctx['msgId']);
        return true;
    }
    if (in_array($word, ['!трек', '!song', '!песня'], true)) {
        $cur = db_one("SELECT title, requester FROM songs WHERE user_id = ? AND status = 'playing' ORDER BY id DESC LIMIT 1", [$user['id']]);
        tw_send($bid, $cur ? 'Сейчас играет: ' . $cur['title'] . ($cur['requester'] ? ' (заказал ' . $cur['requester'] . ')' : '') : 'Сейчас ничего не играет', $ctx['msgId']);
        return true;
    }
    if (in_array($word, ['!очередь', '!queue'], true)) {
        $q = db_all("SELECT title FROM songs WHERE user_id = ? AND status = 'queued' ORDER BY pos, id LIMIT 3", [$user['id']]);
        tw_send($bid, $q ? 'Дальше: ' . implode(' · ', array_map(fn($s, $i) => ($i + 1) . '. ' . mb_substr($s['title'], 0, 60), $q, array_keys($q))) : 'Очередь пуста', $ctx['msgId']);
        return true;
    }
    if ($r['mod'] && in_array($word, ['!skip', '!пропустить', '!скип'], true)) {
        music_next($user, 'skipped', 'пропущен модератором');
        tw_send($bid, 'Трек пропущен', $ctx['msgId']);
        return true;
    }
    // разрешить ссылку
    if ($r['mod'] && $word === '!permit' && $arg !== '' && !empty(mod_config((int)$user['id'])['permit'])) {
        $target = tw_get_user_by_login(ltrim(explode(' ', $arg)[0], '@'));
        if ($target) {
            kv_set('permit:' . $user['id'] . ':' . $target['id'], 1, 60);
            tw_send($bid, '@' . $target['display_name'] . ', можно отправить ссылку в течение минуты');
        }
        return true;
    }
    // озвучка: !tts текст — текст уходит на OBS-страницу /w/tts.php и читается вслух
    $tts = tts_config((int)$user['id']);
    if ($tts['on'] && $word === '!tts') {
        if (!access_ok($user, (string)$tts['access'], $r, $ctx['chatterId'], $ctx['login'], (string)$tts['allowList'])) return true;
        $text = trim($arg);
        if ($text === '') { tw_send($bid, '@' . $ctx['name'] . ', напиши текст после !tts', $ctx['msgId']); return true; }
        $ck = 'tts:' . $user['id'] . ':' . $ctx['chatterId'];
        if (!$r['mod']) {
            $last = db_one('SELECT last FROM cooldowns WHERE k = ?', [$ck]);
            if ($last && (int)$last['last'] > now() - (int)$tts['cooldown']) return true;
            set_cooldown($ck);
        }
        db_insert('events', ['user_id' => $user['id'], 'type' => 'tts', 'login' => $ctx['login'], 'name' => $ctx['name'], 'data' => mb_substr($text, 0, (int)$tts['maxLen']), 'created_at' => now()]);
        return true;
    }
    // счётчики стрима (раздел «Счётчики»): !смерть, !смерть -1, !смерть 0 — менять может тот, кому разрешено
    foreach (counters_defs($user) as $c) {
        if ($word === mb_strtolower((string)$c['command'])) {
            counter_chat($user, $c, $ctx, $arg);
            return true;
        }
    }
    return false;
}

function set_cooldown(string $k): void {
    db_exec('DELETE FROM cooldowns WHERE k = ?', [$k]);
    db_insert('cooldowns', ['k' => $k, 'last' => now()]);
}

// ---------- пользовательские команды ----------
function handle_command(array $ctx): bool {
    $user = $ctx['user'];
    $text = $ctx['text'];
    if ($text === '') return false;
    $low = mb_strtolower($text);
    $cmds = db_all('SELECT * FROM commands WHERE user_id = ? AND enabled = 1', [$user['id']]);
    foreach ($cmds as $c) {
        $trigger = mb_strtolower($c['prefix'] . $c['name']);
        $match = $c['prefix'] === '' ? ($low === $trigger) : ($low === $trigger || str_starts_with($low, $trigger . ' '));
        if (!$match) continue;
        if (!access_ok($user, (string)$c['access'], $ctx['roles'], $ctx['chatterId'], $ctx['login'], (string)$c['allow_list'])) return true;
        if (!$ctx['roles']['mod']) {
            if ((int)$c['cooldown_global'] > 0 && (int)$c['last_used'] > now() - (int)$c['cooldown_global']) return true;
            $ck = 'cmd:' . $c['id'] . ':' . $ctx['chatterId'];
            if ((int)$c['cooldown_user'] > 0) {
                $last = db_one('SELECT last FROM cooldowns WHERE k = ?', [$ck]);
                if ($last && (int)$last['last'] > now() - (int)$c['cooldown_user']) return true;
            }
            set_cooldown($ck);
        }
        $count = (int)$c['use_count'] + 1;
        db_update('commands', ['use_count' => $count, 'last_used' => now()], 'id = ?', [$c['id']]);
        $args = trim(mb_substr($text, mb_strlen($trigger)));
        tw_send($user['twitch_id'], render_vars((string)$c['response'], $user, $ctx, $count, $args));
        return true;
    }
    return false;
}

// Статус эфира свежий всегда: если данные старше минуты, спрашиваем Twitch прямо сейчас (не зависим от cron)
function stream_fresh(array $user): ?array {
    $st = db_one('SELECT * FROM streams WHERE user_id = ?', [$user['id']]);
    if ($st && (int)$st['updated_at'] > now() - 60) return $st;
    $r = helix('GET', 'streams', ['user_id' => $user['twitch_id']]);
    if ($r['code'] !== 200) return $st; // Twitch не ответил — оставляем последнее известное
    $s = $r['json']['data'][0] ?? null;
    if (!$s) {
        db_exec('DELETE FROM streams WHERE user_id = ?', [$user['id']]);
        db_insert('streams', ['user_id' => $user['id'], 'live' => 0, 'started_at' => 0, 'viewers' => 0, 'peak' => 0, 'title' => '', 'game' => '', 'thumbnail' => '', 'updated_at' => now()]);
    } else {
        $started = strtotime($s['started_at']) ?: now();
        $peak = ($st && (int)$st['started_at'] === $started) ? max((int)$st['peak'], (int)$s['viewer_count']) : (int)$s['viewer_count'];
        db_exec('DELETE FROM streams WHERE user_id = ?', [$user['id']]);
        db_insert('streams', ['user_id' => $user['id'], 'live' => 1, 'started_at' => $started, 'viewers' => (int)$s['viewer_count'], 'peak' => $peak,
            'title' => $s['title'], 'game' => $s['game_name'], 'thumbnail' => $s['thumbnail_url'], 'updated_at' => now()]);
    }
    return db_one('SELECT * FROM streams WHERE user_id = ?', [$user['id']]);
}

// Список включённых команд канала для ответа «!команды»
function commands_line(array $user): string {
    // только команды, которые может вызвать любой зритель; длина ограничена, чтобы сообщение не обрезалось в Twitch
    $rows = db_all("SELECT prefix, name FROM commands WHERE user_id = ? AND enabled = 1 AND access = 'all' ORDER BY name", [(int)$user['id']]);
    $items = array_map(fn($c) => $c['prefix'] . $c['name'], $rows);
    // встроенные команды музыки работают на тарифе «Про» и выше; ставим их первыми, чтобы не обрезались длинным списком
    if (plan_limits($user)['music']) $items = array_values(array_unique(array_merge(['!трек', '!очередь'], $items)));
    $out = []; $len = 0;
    foreach ($items as $i => $t) {
        if ($len + mb_strlen($t) + 2 > 360) return implode(', ', $out) . ' и ещё ' . (count($items) - $i);
        $out[] = $t; $len += mb_strlen($t) + 2;
    }
    return $out ? implode(', ', $out) : 'пока нет команд';
}

function render_vars(string $tpl, array $user, array $ctx, int $count, string $args = ''): string {
    $st = stream_fresh($user);
    $live = $st && (int)$st['live'];
    $target = $args !== '' ? ltrim(explode(' ', $args)[0], '@') : $ctx['name'];
    return strtr($tpl, [
        '{user}' => $ctx['name'], '{count}' => (string)$count, '{target}' => $target, '{args}' => $args,
        '{uptime}' => $live ? fmt_duration(now() - (int)$st['started_at']) : 'стрим сейчас не идёт',
        '{viewers}' => $live ? (string)$st['viewers'] : '0',
        '{time}' => date('H:i') . ' МСК', '{channel}' => $user['display_name'] ?: $user['login'],
        '{game}' => $st['game'] ?? '', '{title}' => $st['title'] ?? '',
        '{commands}' => str_contains($tpl, '{commands}') ? commands_line($user) : '',
    ]);
}

// ---------- музыка ----------
// Название трека по ссылке на музыкальный сервис (кроме YouTube): Spotify — через oEmbed, остальные — по og:title страницы.
function music_link_title(string $url): ?string {
    $host = preg_replace('/^(www|m)\./', '', strtolower((string)parse_url($url, PHP_URL_HOST)));
    if ($host === 'open.spotify.com') {
        $r = http_request('GET', 'https://open.spotify.com/oembed?url=' . rawurlencode($url), [], null, 6);
        $t = trim((string)($r['json']['title'] ?? ''));
        return $t !== '' ? mb_substr($t, 0, 120) : null;
    }
    if (!preg_match('~^(music\.yandex\.(ru|com|by|kz)|music\.apple\.com|soundcloud\.com|deezer\.com|vk\.com|vk\.ru|zvuk\.com|music\.mts\.ru)$~', $host)) return null;
    $r = http_request('GET', $url, ['Accept-Language' => 'ru'], null, 6);
    if ($r['code'] !== 200) return null;
    if (!preg_match('~<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)~i', $r['raw'], $m) && !preg_match('~<title>([^<]+)</title>~i', $r['raw'], $m)) return null;
    $t = html_entity_decode(trim($m[1]), ENT_QUOTES);
    $t = preg_replace('~\s*[.:|]\s*(слушать|listen)\b.*$~ui', '', $t);
    $t = preg_replace('~\s*[|—–-]\s*(Яндекс[ .]?Музык[аи]|Yandex Music|SoundCloud|Apple Music|Deezer|VK|ВКонтакте|Звук)\s*$~ui', '', $t);
    $t = trim((string)$t);
    return mb_strlen($t) >= 2 && !preg_match('~^(Яндекс Музыка|Yandex Music|SoundCloud|ВКонтакте|VK)$~ui', $t) ? mb_substr($t, 0, 120) : null;
}

// Почему видео не ставим в очередь (null — можно). Одна проверка для заказов, импорта плейлистов и подбора:
// тексты — те же, что уходят в чат и показываются в списке импорта.
function music_video_problem(array $cfg, array $v): ?array {
    if ($v['duration'] <= 0) return ['code' => 'unavailable', 'text' => 'не удалось узнать длительность: видео недоступно'];
    if ($v['live']) return ['code' => 'live', 'text' => 'прямая трансляция — такие не ставим'];
    if (!$v['embeddable']) return ['code' => 'embed', 'text' => 'видео запрещено проигрывать на других сайтах'];
    if ($v['duration'] < 30) return ['code' => 'short', 'text' => 'короче 30 секунд — это не песня'];
    if ((int)$cfg['maxLen'] > 0 && $v['duration'] > (int)$cfg['maxLen']) return ['code' => 'long', 'text' => 'длиннее ' . gmdate('i:s', (int)$cfg['maxLen']) . ' — лимит канала'];
    if ((int)$cfg['minViews'] > 0 && $v['views'] < (int)$cfg['minViews']) return ['code' => 'views', 'text' => 'меньше ' . number_format((int)$cfg['minViews'], 0, '', ' ') . ' просмотров — лимит канала'];
    if (($w = text_has_any($v['title'], $cfg['stop'] ?? [])) !== null) return ['code' => 'stop', 'text' => 'в названии стоп-слово «' . $w . '»'];
    return null;
}

function song_request(array $user, string $query, string $requester, string $method, ?string $redemptionId = null, ?string $rewardId = null): array {
    // музыка — функция тарифа «Про»: проверяем здесь, чтобы не обходилось ни командой, ни наградой, ни донатом
    if (!plan_limits($user)['music']) return ['ok' => false, 'message' => 'заказ музыки доступен на тарифе «Про» и выше'];
    $cfg = music_config((int)$user['id']);
    if (empty($cfg['open'])) return ['ok' => false, 'message' => 'приём заказов сейчас закрыт'];
    $query = trim($query);
    if ($query === '') return ['ok' => false, 'message' => 'напиши ссылку на YouTube или название трека: !' . $cfg['cmd']['name'] . ' Кино — Группа крови'];
    $id = yt_parse_id($query);
    if (!cfg('YOUTUBE_API_KEY')) return ['ok' => false, 'message' => 'музыка не настроена: нет ключа YouTube'];
    if (!$id && preg_match('~https?://\S+~i', $query, $lm)) {
        // Яндекс Музыка, Spotify, VK, SoundCloud…: берём название трека со страницы и ищем его на YouTube
        $title = !empty($cfg['search']) ? music_link_title($lm[0]) : null;
        if (!$title) return ['ok' => false, 'message' => 'по этой ссылке не получилось узнать трек: пришли ссылку на YouTube или название трека'];
        $query = $title;
    }
    $v = $id ? yt_video($id) : (!empty($cfg['search']) ? yt_search($query) : null);
    if (!$v) return ['ok' => false, 'message' => $id ? 'не нашёл это видео' : 'ничего не нашёл по запросу'];
    $problem = music_video_problem($cfg, $v);
    if ($problem) return ['ok' => false, 'message' => $problem['text']];
    $mine = db_one("SELECT COUNT(*) AS c FROM songs WHERE user_id = ? AND requester = ? AND status IN ('queued','pending')", [$user['id'], $requester]);
    if ((int)$cfg['perUser'] > 0 && (int)$mine['c'] >= (int)$cfg['perUser'] && !in_array($method, ['donate', 'manual'], true)) return ['ok' => false, 'message' => 'у тебя уже ' . $mine['c'] . ' трека в очереди'];
    $status = !empty($cfg['manual']) && $method !== 'manual' ? 'pending' : 'queued'; // стример добавляет сам — без одобрения и лимита
    $pos = (int)(db_one("SELECT MAX(pos) AS m FROM songs WHERE user_id = ? AND status = 'queued'", [$user['id']])['m'] ?? 0) + 1;
    if ($method === 'donate') {
        $pos = (int)(db_one("SELECT MIN(pos) AS m FROM songs WHERE user_id = ? AND status = 'queued'", [$user['id']])['m'] ?? 1) - 1;
        $status = 'queued';
    }
    db_insert('songs', [
        'user_id' => $user['id'], 'video_id' => $v['id'], 'url' => 'https://youtu.be/' . $v['id'], 'source' => 'YouTube', 'title' => $v['title'],
        'duration' => $v['duration'], 'requester' => $requester, 'method' => $method, 'redemption_id' => $redemptionId, 'reward_id' => $rewardId,
        'status' => $status, 'pos' => $pos, 'created_at' => now(),
    ]);
    if ($status === 'pending') return ['ok' => true, 'message' => '«' . $v['title'] . '» отправлен на проверку стримеру'];
    $ahead = db_all("SELECT duration FROM songs WHERE user_id = ? AND status IN ('queued','playing') AND pos < ?", [$user['id'], $pos]);
    $place = count($ahead) + 1;
    $eta = intdiv(array_sum(array_column($ahead, 'duration')), 60);
    return ['ok' => true, 'message' => '«' . $v['title'] . '» в очереди, позиция ' . $place . ($eta ? ', примерно через ' . $eta . ' мин' : '')];
}

// Автовоспроизведение — в music_auto.php (music_autofill)
// Переход к следующему треку. outcome: played — доиграл до конца; skipped — не доигран, $reason объясняет зрителю почему
function music_next(array $user, string $outcome = 'played', string $reason = ''): ?array {
    $cur = db_one("SELECT * FROM songs WHERE user_id = ? AND status = 'playing' ORDER BY id DESC LIMIT 1", [$user['id']]);
    db_exec("UPDATE songs SET status = ?, played_at = ? WHERE user_id = ? AND status = 'playing'", [$outcome === 'played' ? 'played' : 'skipped', now(), $user['id']]);
    if ($cur) {
        if ($outcome === 'played') music_fulfil($user, $cur);
        else music_unplayed($user, $cur, $reason !== '' ? $reason : 'пропущен');
    }
    $next = db_one("SELECT * FROM songs WHERE user_id = ? AND status = 'queued' ORDER BY pos, id LIMIT 1", [$user['id']]);
    if (!$next && music_autofill($user)) $next = db_one("SELECT * FROM songs WHERE user_id = ? AND status = 'queued' ORDER BY pos, id LIMIT 1", [$user['id']]);
    if ($next) db_exec("UPDATE songs SET status = 'playing', played_at = ? WHERE id = ?", [now(), $next['id']]);
    return $next;
}

// Статус заказа баллов в Twitch: FULFILLED — трек сыграл, CANCELED — заказ отменён и баллы вернулись зрителю.
// Twitch меняет статус только у ещё не выполненного заказа (UNFULFILLED), поэтому заказ держим невыполненным до конца трека.
function redemption_set(array $user, string $rewardId, string $redemptionId, string $status): bool {
    if ($rewardId === '' || $redemptionId === '') return false;
    $token = tw_user_token($user);
    if (!$token) {
        logline('points', $user['login'] . ': нет токена, заказ ' . $status . ' не отправлен');
        return false;
    }
    $r = helix('PATCH', 'channel_points/custom_rewards/redemptions', ['broadcaster_id' => $user['twitch_id'], 'reward_id' => $rewardId, 'id' => $redemptionId], ['status' => $status], $token);
    if ($r['code'] !== 200) logline('points', $user['login'] . ": $status $redemptionId: " . ($r['json']['message'] ?? 'код ' . $r['code']));
    return $r['code'] === 200;
}

// Трек сыграл до конца — заказ выполнен
function music_fulfil(array $user, array $song): void {
    if ($song['redemption_id'] && $song['reward_id']) redemption_set($user, (string)$song['reward_id'], (string)$song['redemption_id'], 'FULFILLED');
}

// Заказ за баллы не сыграл (пропущен, удалён, отклонён, не проигрывается): баллы возвращаем и говорим зрителю почему
function music_unplayed(array $user, array $song, string $reason): void {
    if (!$song['redemption_id'] || !$song['reward_id']) return;
    redemption_set($user, (string)$song['reward_id'], (string)$song['redemption_id'], 'CANCELED');
    tw_send($user['twitch_id'], '@' . $song['requester'] . ', «' . mb_substr((string)$song['title'], 0, 60) . '» не сыграл (' . $reason . '). Баллы возвращены.');
}

// Текущий трек прерван (сыграть другой сейчас) — он не доигран, значит пропущен
function music_cut_current(array $user, string $reason): void {
    $cur = db_one("SELECT * FROM songs WHERE user_id = ? AND status = 'playing' ORDER BY id DESC LIMIT 1", [$user['id']]);
    if (!$cur) return;
    db_exec("UPDATE songs SET status = 'skipped', played_at = ? WHERE id = ? AND status = 'playing'", [now(), $cur['id']]);
    music_unplayed($user, $cur, $reason);
}

// Причина для зрителя, если YouTube не дал проиграть трек (код ошибки плеера YouTube)
function music_yt_error_text(int $code): string {
    return match ($code) {
        2 => 'неверная ссылка на видео',
        5 => 'браузер не смог воспроизвести видео',
        100 => 'видео удалено или скрыто',
        101, 150 => 'автор запретил проигрывать видео на других сайтах',
        default => 'видео не проигрывается',
    };
}

const POINTS_TITLE = 'Заказать трек';

// Баллы канала: Twitch списал их сразу. Каждый заказ что-то оставляет: трек в очереди, либо баллы возвращены с причиной
// и строка в истории «Отклонён». Молча не отбрасываем ни один заказ, даже если бот не подключён или награда чужая.
function bot_on_redemption(array $user, array $ev): void {
    $uid = (int)$user['id'];
    $music = music_config($uid);
    $rewardId = (string)($ev['reward']['id'] ?? '');
    $redemptionId = (string)($ev['id'] ?? '');
    $login = (string)($ev['user_login'] ?? '');
    $name = (string)($ev['user_name'] ?? $login);
    $input = trim((string)($ev['user_input'] ?? ''));
    $title = (string)($ev['reward']['title'] ?? '');
    $ours = $rewardId !== '' && $rewardId === (string)($music['points']['rewardId'] ?? '');
    $journal = function (string $note) use ($uid, $login, $name, $title, $input): void {
        db_insert('events', ['user_id' => $uid, 'type' => 'redemption', 'login' => $login, 'name' => $name,
            'data' => json_encode(['reward' => $title, 'input' => $input, 'note' => $note], JSON_UNESCAPED_UNICODE), 'created_at' => now()]);
    };
    if (!$ours) { // награда не из StreOps: вернуть можно, только если Twitch разрешает. Зрителю в чат не пишем — награда чужая
        $back = redemption_set($user, $rewardId, $redemptionId, 'CANCELED');
        $journal('награда создана не в StreOps: ' . ($back ? 'баллы возвращены' : 'баллы не возвращены, верни вручную в Twitch'));
        return;
    }
    $refuse = function (string $why) use ($user, $uid, $rewardId, $redemptionId, $name, $input, $journal): void {
        $back = redemption_set($user, $rewardId, $redemptionId, 'CANCELED');
        db_insert('songs', ['user_id' => $uid, 'video_id' => '', 'url' => '', 'source' => 'YouTube', 'title' => mb_substr($input !== '' ? $input : 'без ссылки', 0, 200),
            'duration' => 0, 'requester' => $name, 'method' => 'points', 'redemption_id' => $redemptionId, 'reward_id' => $rewardId,
            'status' => 'rejected', 'pos' => 0, 'created_at' => now(), 'played_at' => now()]);
        tw_send($user['twitch_id'], '@' . $name . ' заказ не принят: ' . $why . ($back ? '. Баллы возвращены.' : '. Баллы вернуть не получилось, верни их вручную.'));
        $journal('не принят: ' . $why . ($back ? ', баллы возвращены' : ', баллы не возвращены'));
    };
    if (empty($music['points']['on'])) { $refuse('заказы баллами выключены'); return; }
    if (!plan_limits($user)['music']) { $refuse('музыка доступна на тарифе «Про» и выше'); return; }
    if (bl_find($login, (string)($ev['user_id'] ?? ''))) { $refuse('ты в чёрном списке StreOps'); return; } // заблокированный зритель не получает музыку за баллы
    $res = song_request($user, $input, $name, 'points', $redemptionId, $rewardId);
    if (!$res['ok']) { $refuse($res['message']); return; }
    tw_send($user['twitch_id'], '@' . $name . ' ' . $res['message'] . '. Если трек не сыграет, баллы вернутся.');
    $journal('принят: ' . $res['message']);
}

// Награда «Заказать трек» на Twitch: включаем и ставим цену. Награды нет — создаём. Уже есть (создана раньше и id не сохранился) —
// берём её. Удалена на Twitch — создаём заново. Возвращает текст ошибки или null.
function points_reward_enable(array $user, array &$points): ?string {
    $token = tw_user_token($user);
    if (!$token) return 'Нет доступа к Twitch: выйди из StreOps и войди через Twitch заново';
    $bid = ['broadcaster_id' => $user['twitch_id']];
    $body = ['cost' => max(1, (int)$points['cost']), 'is_enabled' => true, 'should_redemptions_skip_request_queue' => false];
    if (!empty($points['rewardId'])) {
        $r = helix('PATCH', 'channel_points/custom_rewards', $bid + ['id' => $points['rewardId']], $body, $token);
        if ($r['code'] === 200) return null;
        if ($r['code'] !== 404) return 'Не удалось включить награду на Twitch: ' . ($r['json']['message'] ?? 'код ' . $r['code']);
        $points['rewardId'] = null;
    }
    $r = helix('POST', 'channel_points/custom_rewards', $bid, $body + ['title' => POINTS_TITLE, 'prompt' => 'Ссылка на YouTube или название трека', 'is_user_input_required' => true], $token);
    if ($r['code'] === 200) { $points['rewardId'] = $r['json']['data'][0]['id']; return null; }
    $list = helix('GET', 'channel_points/custom_rewards', $bid + ['only_manageable_rewards' => 'true'], null, $token);
    foreach ($list['json']['data'] ?? [] as $x) {
        if (($x['title'] ?? '') !== POINTS_TITLE) continue;
        $points['rewardId'] = $x['id'];
        $p = helix('PATCH', 'channel_points/custom_rewards', $bid + ['id' => $x['id']], $body, $token);
        return $p['code'] === 200 ? null : 'Награда найдена, но не удалось включить её на Twitch: ' . ($p['json']['message'] ?? 'код ' . $p['code']);
    }
    return 'Не удалось создать награду: ' . ($r['json']['message'] ?? 'баллы канала доступны только компаньонам и партнёрам Twitch');
}

// Выключаем награду на Twitch, чтобы зрители не тратили баллы на заказ, который уже не принимается
function points_reward_disable(array $user, array $points): ?string {
    if (empty($points['rewardId'])) return null;
    $token = tw_user_token($user);
    if (!$token) return 'Выключи награду «' . POINTS_TITLE . '» в Twitch вручную: нет доступа к Twitch';
    $r = helix('PATCH', 'channel_points/custom_rewards', ['broadcaster_id' => $user['twitch_id'], 'id' => $points['rewardId']], ['is_enabled' => false], $token);
    return in_array($r['code'], [200, 404], true) ? null : 'Награду не удалось выключить на Twitch, выключи её вручную: ' . ($r['json']['message'] ?? 'код ' . $r['code']);
}

function bot_on_donation(array $user, string $name, int $amount, string $message): void {
    $music = music_config((int)$user['id']);
    if (empty($music['donate']['on']) || $amount < (int)$music['donate']['min']) return;
    if (!preg_match('~(https?://\S*(youtube\.com|youtu\.be)\S*)~i', $message, $m)) return;
    $res = song_request($user, $m[1], $name ?: 'Донат', 'donate');
    if ($res['ok']) tw_send($user['twitch_id'], $name . ' заказал трек донатом: ' . $res['message']);
}

// ---------- розыгрыши ----------
function giveaway_entry(array $ctx): void {
    $user = $ctx['user'];
    $gw = db_one("SELECT * FROM giveaways WHERE user_id = ? AND status = 'collecting' ORDER BY id DESC LIMIT 1", [$user['id']]);
    if (!$gw) return;
    if ((int)$gw['ends_at'] > 0 && (int)$gw['ends_at'] < now()) return;
    $rules = json_decode((string)$gw['rules'], true) ?: [];
    $mode = $rules['entry'] ?? 'word';
    if ($mode === 'word' && mb_strtolower(trim($ctx['text'])) !== mb_strtolower(trim((string)$gw['keyword']))) return;
    if ($mode !== 'word' && $mode !== 'active') return;
    $r = $ctx['roles'];
    if (!empty($rules['noMods']) && ($r['mod'] || $r['bot'])) return;
    if ($r['bot']) return;
    if (!empty($rules['followers']) && !$r['mod'] && !$r['sub'] && !$r['vip'] && !is_follower($user, $ctx['chatterId'])) return;
    if (!empty($rules['noNew'])) { $age = account_age_days($ctx['chatterId']); if ($age !== null && $age < 7) return; }
    if (!empty($rules['noRecent'])) {
        $recent = db_all("SELECT winners FROM giveaways WHERE user_id = ? AND drawn_at > ?", [$user['id'], now() - 7 * 86400]);
        foreach ($recent as $g) foreach (json_decode((string)$g['winners'], true) ?: [] as $w) if (($w['id'] ?? '') === $ctx['chatterId']) return;
    }
    $weight = 2;
    if (!empty($rules['luck'])) { if ($r['sub']) $weight = 4; elseif ($r['vip']) $weight = 3; }
    try {
        db_insert('giveaway_entries', ['giveaway_id' => $gw['id'], 'chatter_id' => $ctx['chatterId'], 'login' => $ctx['login'], 'display' => $ctx['name'],
            'role' => role_label($r), 'weight' => $weight, 'created_at' => now()]);
    } catch (Throwable $e) { /* уже участвует */ }
}

// ---------- уведомления: подписки, рейды ----------
function bot_handle_notification(array $user, array $ev): void {
    $type = (string)($ev['notice_type'] ?? '');
    $map = ['sub' => 'sub', 'resub' => 'resub', 'sub_gift' => 'gift', 'community_sub_gift' => 'gift', 'raid' => 'raid', 'prime_paid_upgrade' => 'sub', 'gift_paid_upgrade' => 'sub'];
    if (!isset($map[$type])) return;
    $data = [];
    if ($type === 'raid') $data = ['viewers' => (int)($ev['raid']['viewer_count'] ?? 0)];
    if ($type === 'resub') $data = ['months' => (int)($ev['resub']['cumulative_months'] ?? 0), 'tier' => $ev['resub']['sub_tier'] ?? ''];
    if ($type === 'sub') $data = ['tier' => $ev['sub']['sub_tier'] ?? '', 'months' => (int)($ev['sub']['duration_months'] ?? 1)];
    if ($type === 'community_sub_gift') $data = ['total' => (int)($ev['community_sub_gift']['total'] ?? 1)];
    $login = $type === 'raid' ? ($ev['raid']['user_login'] ?? $ev['chatter_user_login'] ?? '') : ($ev['chatter_user_login'] ?? '');
    $name = $type === 'raid' ? ($ev['raid']['user_name'] ?? $login) : ($ev['chatter_user_name'] ?? $login);
    db_insert('events', ['user_id' => $user['id'], 'type' => $map[$type], 'login' => $login, 'name' => $name, 'data' => json_encode($data, JSON_UNESCAPED_UNICODE), 'created_at' => now()]);
}

function widget_cfg(array $user, string $id): array {
    $all = settings_get((int)$user['id'], 'widgets', ['on' => [], 'cfg' => []]);
    return $all['cfg'][$id] ?? [];
}

// Действия над очередью музыки: владелец канала или помощник с правом управлять музыкой.
function music_act(array $u, string $act, int $id): void {
    $uid = (int)$u['id'];
    $song = $id ? db_one('SELECT * FROM songs WHERE id = ? AND user_id = ?', [$id, $uid]) : null;
    switch ($act) {
        case 'next': music_next($u, 'skipped', 'пропущен стримером'); break;
        case 'remove': if ($song) { db_update('songs', ['status' => 'skipped', 'played_at' => now()], 'id = ?', [$id]); music_unplayed($u, $song, 'убран из очереди'); } break;
        case 'up':
            if ($song) {
                $prev = db_one("SELECT * FROM songs WHERE user_id = ? AND status = 'queued' AND (pos < ? OR (pos = ? AND id < ?)) ORDER BY pos DESC, id DESC LIMIT 1", [$uid, $song['pos'], $song['pos'], $id]);
                if ($prev) { db_update('songs', ['pos' => $prev['pos']], 'id = ?', [$id]); db_update('songs', ['pos' => $song['pos'] == $prev['pos'] ? $prev['pos'] + 1 : $song['pos']], 'id = ?', [$prev['id']]); }
            }
            break;
        case 'down': // ниже: меняемся местами со следующим треком очереди
            if ($song) {
                $next = db_one("SELECT * FROM songs WHERE user_id = ? AND status = 'queued' AND (pos > ? OR (pos = ? AND id > ?)) ORDER BY pos, id LIMIT 1", [$uid, $song['pos'], $song['pos'], $id]);
                if ($next) { db_update('songs', ['pos' => $next['pos']], 'id = ?', [$id]); db_update('songs', ['pos' => $song['pos']], 'id = ?', [$next['id']]); }
            }
            break;
        case 'top': // в начало очереди
            if ($song) { $pos = (int)(db_one("SELECT MIN(pos) m FROM songs WHERE user_id = ? AND status = 'queued'", [$uid])['m'] ?? 1) - 1; db_update('songs', ['pos' => $pos], 'id = ?', [$id]); }
            break;
        case 'playnow': // сыграть сейчас: текущий трек считается сыгранным, выбранный запускается
            if ($song && in_array($song['status'], ['queued', 'pending'], true)) {
                music_cut_current($u, 'заменён другим треком');
                db_update('songs', ['status' => 'playing', 'played_at' => now()], 'id = ?', [$id]);
            }
            break;
        case 'approve':
            if ($song) { $pos = (int)(db_one("SELECT MAX(pos) m FROM songs WHERE user_id = ? AND status = 'queued'", [$uid])['m'] ?? 0) + 1; db_update('songs', ['status' => 'queued', 'pos' => $pos], 'id = ?', [$id]); }
            break;
        case 'reject':
            if ($song) { db_update('songs', ['status' => 'rejected', 'played_at' => now()], 'id = ?', [$id]); music_unplayed($u, $song, 'отклонён стримером'); }
            break;
        case 'clear':
            foreach (db_all("SELECT * FROM songs WHERE user_id = ? AND status = 'queued'", [$uid]) as $q) {
                db_update('songs', ['status' => 'skipped', 'played_at' => now()], 'id = ?', [$q['id']]);
                music_unplayed($u, $q, 'очередь очищена');
            }
            break;
        default: fail('Неизвестное действие');
    }
}

// Сторож: трек «играет» дольше своей длины, и ни один плеер не выходил на связь (панель и OBS-источник молчат) —
// трек не сыгран, баллы возвращаются. Пауза и буферизация не считаются: плеер на связи.
function music_watchdog(): void {
    foreach (db_all("SELECT * FROM songs WHERE status = 'playing' AND played_at > 0 AND played_at + duration + 120 < ? LIMIT 50", [now()]) as $song) {
        if ((int)(kv_get('player:seen:' . $song['user_id']) ?? 0) > now() - 120) continue;
        $u = db_one('SELECT * FROM users WHERE id = ?', [$song['user_id']]);
        if (!$u || db_exec("UPDATE songs SET status = 'skipped' WHERE id = ? AND status = 'playing'", [$song['id']]) === 0) continue;
        music_unplayed($u, $song, 'плеер музыки не был открыт');
    }
}

// Плеер на связи: панель или OBS-источник недавно обращались к серверу (сторож это проверяет)
function player_heartbeat(int $uid): void {
    if ((int)(kv_get('player:seen:' . $uid) ?? 0) < now() - 30) kv_set('player:seen:' . $uid, now(), 3600);
}
