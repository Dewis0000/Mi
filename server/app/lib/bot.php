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
    return $out;
}

function music_defaults(): array {
    return [
        'open' => true,
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
        'text' => mb_substr($text, 0, 500), 'badges' => json_encode(array_column($badges, 'set_id')), 'color' => $ev['color'] ?? '', 'created_at' => now(),
    ]);
    if ($b && $chatterId === (string)$b['id']) return; // свои сообщения не обрабатываем

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
    if ($r['broadcaster'] || $r['bot']) return false;
    if ($r['mod'] && !empty($cfg['exempt']['mods'])) return false;
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
        if (!plan_limits($user)['music']) { tw_send($bid, '@' . $ctx['name'] . ', заказ музыки доступен на тарифе «Про»', $ctx['msgId']); return true; }
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
        music_next($user);
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
    // счётчики виджета «Счётчик»: !смерть, !смерть -1, !смерть 0
    $counterCmd = mb_strtolower((string)(widget_cfg($user, 'deaths')['content']['command'] ?? '!смерть'));
    if ($word === $counterCmd) {
        $val = (int)(db_one('SELECT value FROM counters WHERE user_id = ? AND name = ?', [$user['id'], 'deaths'])['value'] ?? 0);
        if ($r['mod']) {
            if ($arg === '0' || $arg === 'сброс') $val = 0;
            elseif (preg_match('/^[+-]?\d+$/', $arg)) $val += (int)$arg;
            else $val++;
            db_exec('DELETE FROM counters WHERE user_id = ? AND name = ?', [$user['id'], 'deaths']);
            db_insert('counters', ['user_id' => $user['id'], 'name' => 'deaths', 'value' => $val]);
        }
        $label = (string)(widget_cfg($user, 'deaths')['content']['label'] ?? 'Счётчик');
        tw_send($bid, $label . ': ' . $val);
        return true;
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

function render_vars(string $tpl, array $user, array $ctx, int $count, string $args = ''): string {
    $st = db_one('SELECT * FROM streams WHERE user_id = ?', [$user['id']]);
    $live = $st && (int)$st['live'];
    $target = $args !== '' ? ltrim(explode(' ', $args)[0], '@') : $ctx['name'];
    return strtr($tpl, [
        '{user}' => $ctx['name'], '{count}' => (string)$count, '{target}' => $target, '{args}' => $args,
        '{uptime}' => $live ? fmt_duration(now() - (int)$st['started_at']) : 'стрим сейчас не идёт',
        '{viewers}' => $live ? (string)$st['viewers'] : '0',
        '{time}' => date('H:i') . ' МСК', '{channel}' => $user['display_name'] ?: $user['login'],
        '{game}' => $st['game'] ?? '', '{title}' => $st['title'] ?? '',
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

function song_request(array $user, string $query, string $requester, string $method, ?string $redemptionId = null, ?string $rewardId = null): array {
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
    if ($v['live']) return ['ok' => false, 'message' => 'прямые трансляции заказывать нельзя'];
    if (!$v['embeddable']) return ['ok' => false, 'message' => 'это видео запрещено проигрывать на других сайтах'];
    if ((int)$cfg['maxLen'] > 0 && $v['duration'] > (int)$cfg['maxLen']) return ['ok' => false, 'message' => 'трек длиннее ' . gmdate('i:s', (int)$cfg['maxLen']) . ', выбери покороче'];
    if ((int)$cfg['minViews'] > 0 && $v['views'] < (int)$cfg['minViews']) return ['ok' => false, 'message' => 'у видео слишком мало просмотров'];
    if (text_has_any($v['title'], $cfg['stop'] ?? [])) return ['ok' => false, 'message' => 'этот трек нельзя заказать'];
    $mine = db_one("SELECT COUNT(*) AS c FROM songs WHERE user_id = ? AND requester = ? AND status IN ('queued','pending')", [$user['id'], $requester]);
    if ((int)$cfg['perUser'] > 0 && (int)$mine['c'] >= (int)$cfg['perUser'] && $method !== 'donate') return ['ok' => false, 'message' => 'у тебя уже ' . $mine['c'] . ' трека в очереди'];
    $status = !empty($cfg['manual']) ? 'pending' : 'queued';
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

function music_next(array $user): ?array {
    db_exec("UPDATE songs SET status = 'played', played_at = ? WHERE user_id = ? AND status = 'playing'", [now(), $user['id']]);
    $next = db_one("SELECT * FROM songs WHERE user_id = ? AND status = 'queued' ORDER BY pos, id LIMIT 1", [$user['id']]);
    if ($next) db_exec("UPDATE songs SET status = 'playing', played_at = ? WHERE id = ?", [now(), $next['id']]);
    return $next;
}

function refund_redemption(array $user, array $song): void {
    if (!$song['redemption_id'] || !$song['reward_id']) return;
    $token = tw_user_token($user);
    if (!$token) return;
    helix('PATCH', 'channel_points/custom_rewards/redemptions', ['broadcaster_id' => $user['twitch_id'], 'reward_id' => $song['reward_id'], 'id' => $song['redemption_id']], ['status' => 'CANCELED'], $token);
}

function bot_on_redemption(array $user, array $ev): void {
    $music = music_config((int)$user['id']);
    $rewardId = $ev['reward']['id'] ?? '';
    if (empty($music['points']['on']) || $rewardId !== ($music['points']['rewardId'] ?? null)) return;
    $res = song_request($user, (string)($ev['user_input'] ?? ''), (string)$ev['user_name'], 'points', (string)$ev['id'], $rewardId);
    tw_send($user['twitch_id'], '@' . $ev['user_name'] . ' ' . $res['message']);
    if (!$res['ok']) refund_redemption($user, ['redemption_id' => $ev['id'], 'reward_id' => $rewardId]);
    db_insert('events', ['user_id' => $user['id'], 'type' => 'redemption', 'login' => $ev['user_login'] ?? '', 'name' => $ev['user_name'] ?? '',
        'data' => json_encode(['reward' => $ev['reward']['title'] ?? '', 'input' => $ev['user_input'] ?? ''], JSON_UNESCAPED_UNICODE), 'created_at' => now()]);
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
