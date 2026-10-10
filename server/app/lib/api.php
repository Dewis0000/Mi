<?php
// JSON API сайта: /api/index.php?r=<маршрут>. Тело POST — JSON.

function api_input(): array {
    static $in = null;
    if ($in !== null) return $in;
    $raw = (string)file_get_contents('php://input');
    $body = $raw !== '' ? json_decode($raw, true) : [];
    $in = (is_array($body) ? $body : []) + $_GET;
    return $in;
}

function in_str(string $k, int $max = 500, string $def = ''): string {
    $v = api_input()[$k] ?? $def;
    return mb_substr(trim((string)(is_scalar($v) ? $v : $def)), 0, $max);
}

function in_int(string $k, int $def = 0, ?int $min = null, ?int $max = null): int {
    $v = (int)(api_input()[$k] ?? $def);
    if ($min !== null) $v = max($min, $v);
    if ($max !== null) $v = min($max, $v);
    return $v;
}

function in_bool(string $k, bool $def = false): bool {
    $v = api_input()[$k] ?? $def;
    return is_bool($v) ? $v : in_array((string)$v, ['1', 'true', 'on'], true);
}

function stream_row(int $uid): array {
    $s = db_one('SELECT * FROM streams WHERE user_id = ?', [$uid]);
    if (!$s) return ['live' => false, 'startedAt' => 0, 'viewers' => 0, 'peak' => 0, 'title' => '', 'game' => ''];
    return ['live' => (bool)$s['live'], 'startedAt' => (int)$s['started_at'], 'viewers' => (int)$s['viewers'], 'peak' => (int)$s['peak'], 'title' => (string)$s['title'], 'game' => (string)$s['game'], 'updatedAt' => (int)$s['updated_at']];
}

function msg_row(array $m): array {
    return ['id' => (int)$m['id'], 'msgId' => $m['msg_id'], 'chatterId' => $m['chatter_id'], 'login' => $m['chatter_login'], 'name' => $m['chatter_name'],
        'text' => $m['text'], 'badges' => json_decode((string)$m['badges'], true) ?: [], 'color' => $m['color'], 'deleted' => (bool)$m['deleted'], 'at' => (int)$m['created_at']];
}

function event_row(array $e): array {
    return ['id' => (int)$e['id'], 'type' => $e['type'], 'login' => $e['login'], 'name' => $e['name'], 'data' => json_decode((string)$e['data'], true) ?: [], 'at' => (int)$e['created_at']];
}

function action_row(array $a): array {
    return ['id' => (int)$a['id'], 'login' => $a['chatter_login'], 'chatterId' => $a['chatter_id'], 'action' => $a['action'], 'reason' => $a['reason'],
        'duration' => (int)$a['duration'], 'by' => $a['by_login'], 'message' => $a['message'], 'strikes' => $a['strikes'], 'undone' => (bool)$a['undone'], 'at' => (int)$a['created_at']];
}

function song_row(array $s): array {
    return ['id' => (int)$s['id'], 'videoId' => $s['video_id'], 'url' => $s['url'], 'source' => $s['source'], 'title' => $s['title'], 'duration' => (int)$s['duration'],
        'requester' => $s['requester'], 'method' => $s['method'], 'status' => $s['status'], 'at' => (int)$s['created_at']];
}

function cmd_row(array $c): array {
    return ['id' => (int)$c['id'], 'name' => $c['name'], 'prefix' => $c['prefix'], 'response' => $c['response'], 'enabled' => (bool)$c['enabled'],
        'cooldownGlobal' => (int)$c['cooldown_global'], 'cooldownUser' => (int)$c['cooldown_user'], 'access' => $c['access'], 'allowList' => (string)$c['allow_list'],
        'uses' => (int)$c['use_count'], 'description' => (string)$c['description']];
}

function since_for(int $uid): int {
    $s = stream_row($uid);
    return $s['live'] ? $s['startedAt'] : now() - 86400;
}

function api_dispatch(string $r): never {
    require_same_origin();
    switch ($r) {
        // ---------- профиль ----------
        case 'me': {
            $u = current_user();
            if (!$u) json_out(['ok' => true, 'user' => null]);
            $b = bot_account();
            json_out(['ok' => true, 'user' => user_public($u), 'stream' => stream_row((int)$u['id']),
                'bot' => ['login' => $b['login'] ?? cfg('BOT_LOGIN', 'zaka_bot'), 'ready' => (bool)($b['own_app'] ?? false)]]);
        }
        case 'live.list': {
            $rows = db_all('SELECT u.login, u.display_name, u.avatar, s.title, s.game, s.viewers, s.thumbnail FROM streams s JOIN users u ON u.id = s.user_id WHERE s.live = 1 AND u.banned = 0 ORDER BY s.viewers DESC LIMIT 20');
            json_out(['ok' => true, 'items' => array_map(fn($x) => ['login' => $x['login'], 'name' => $x['display_name'] ?: $x['login'], 'avatar' => $x['avatar'], 'title' => $x['title'], 'game' => $x['game'], 'viewers' => (int)$x['viewers'],
                'thumb' => str_replace(['{width}', '{height}'], ['440', '248'], (string)$x['thumbnail'])], $rows)]);
        }

        // ---------- бот ----------
        case 'bot.enable': {
            $u = require_user();
            $b = bot_account();
            if (!$b) fail('Бот ещё не подключён администратором');
            $mod = tw_add_bot_moderator($u);
            $errors = eventsub_ensure_channel($u);
            db_update('users', ['bot_enabled' => 1, 'bot_error' => $errors ? implode('; ', $errors) : null], 'id = ?', [$u['id']]);
            if (!$errors) tw_send($u['twitch_id'], 'StreOps подключён к каналу. Команды: !аптайм, !команды');
            json_out(['ok' => true, 'moderator' => $mod, 'errors' => $errors]);
        }
        case 'bot.disable': {
            $u = require_user();
            eventsub_remove_channel($u);
            db_update('users', ['bot_enabled' => 0, 'bot_error' => null], 'id = ?', [$u['id']]);
            json_out(['ok' => true]);
        }

        // ---------- обзор ----------
        case 'dashboard': {
            $u = require_user();
            $uid = (int)$u['id'];
            $since = since_for($uid);
            $msgs = (int)db_one('SELECT COUNT(*) c FROM chat_messages WHERE user_id = ? AND created_at >= ?', [$uid, $since])['c'];
            $chatters = (int)db_one('SELECT COUNT(DISTINCT chatter_id) c FROM chat_messages WHERE user_id = ? AND created_at >= ?', [$uid, $since])['c'];
            $follows = (int)db_one("SELECT COUNT(*) c FROM events WHERE user_id = ? AND type = 'follow' AND created_at >= ?", [$uid, $since])['c'];
            $deleted = (int)db_one("SELECT COUNT(*) c FROM mod_actions WHERE user_id = ? AND created_at >= ? AND action IN ('delete','warn','timeout','ban')", [$uid, $since])['c'];
            // активность по 10 минут за последние 3 часа
            $from = now() - 3 * 3600;
            $rows = db_all('SELECT created_at, text FROM chat_messages WHERE user_id = ? AND created_at >= ?', [$uid, $from]);
            $buckets = array_fill(0, 18, ['m' => 0, 'c' => 0]);
            foreach ($rows as $row) {
                $i = min(17, intdiv((int)$row['created_at'] - $from, 600));
                $buckets[$i]['m']++;
                if (str_starts_with((string)$row['text'], '!')) $buckets[$i]['c']++;
            }
            $events = array_map('event_row', db_all('SELECT * FROM events WHERE user_id = ? ORDER BY id DESC LIMIT 8', [$uid]));
            $actions = array_map('action_row', db_all('SELECT * FROM mod_actions WHERE user_id = ? ORDER BY id DESC LIMIT 5', [$uid]));
            $top = array_map('cmd_row', db_all('SELECT * FROM commands WHERE user_id = ? ORDER BY use_count DESC LIMIT 4', [$uid]));
            json_out(['ok' => true, 'stream' => stream_row($uid), 'metrics' => ['messages' => $msgs, 'chatters' => $chatters, 'follows' => $follows, 'deleted' => $deleted],
                'chart' => ['from' => $from, 'buckets' => $buckets], 'events' => $events, 'actions' => $actions, 'topCommands' => $top]);
        }
        case 'chat.recent': {
            $u = require_user();
            $after = in_int('after');
            $rows = $after ? db_all('SELECT * FROM chat_messages WHERE user_id = ? AND id > ? ORDER BY id LIMIT 100', [$u['id'], $after])
                : array_reverse(db_all('SELECT * FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 40', [$u['id']]));
            json_out(['ok' => true, 'items' => array_map('msg_row', $rows)]);
        }
        case 'chat.send': {
            $u = require_user();
            $text = in_str('text', 480);
            if ($text === '') fail('Пустое сообщение');
            if (!tw_send($u['twitch_id'], $text)) fail('Бот не смог отправить сообщение. Проверь, что бот подключён к каналу.');
            json_out(['ok' => true]);
        }
        case 'chat.mod': {
            $u = require_user();
            $act = in_str('action', 16);
            $chatterId = in_str('chatterId', 32);
            $login = in_str('login', 64);
            $ok = false;
            if ($act === 'delete') $ok = tw_delete_message($u['twitch_id'], in_str('msgId', 64));
            if ($act === 'timeout') $ok = tw_ban($u['twitch_id'], $chatterId, in_int('duration', 600, 1, 1209600), 'StreOps: решение модератора');
            if ($act === 'ban') $ok = tw_ban($u['twitch_id'], $chatterId, 0, 'StreOps: решение модератора');
            if (!$ok) fail('Twitch не выполнил действие. Бот должен быть модератором канала.');
            if ($act === 'delete') db_exec('UPDATE chat_messages SET deleted = 1 WHERE user_id = ? AND msg_id = ?', [$u['id'], in_str('msgId', 64)]);
            if (in_array($act, ['timeout', 'ban'], true) && $ok) db_exec('UPDATE chat_messages SET deleted = 1 WHERE user_id = ? AND chatter_id = ?', [$u['id'], $chatterId]);
            log_action($u, ['chatterId' => $chatterId, 'login' => $login, 'text' => in_str('text', 500)], $act, 'вручную из панели', $act === 'timeout' ? in_int('duration', 600) : 0, $u['login']);
            json_out(['ok' => true]);
        }

        // ---------- команды ----------
        case 'commands.list': {
            $u = require_user();
            $rows = db_all('SELECT * FROM commands WHERE user_id = ? ORDER BY name', [$u['id']]);
            json_out(['ok' => true, 'items' => array_map('cmd_row', $rows), 'limit' => plan_limits($u)['commands']]);
        }
        case 'commands.save': {
            $u = require_user();
            $id = in_int('id');
            $name = mb_strtolower(ltrim(in_str('name', 40), '!'));
            $name = preg_replace('/\s+/u', '', $name);
            if ($name === '') fail('Укажи название команды');
            $prefix = in_str('prefix', 3, '!');
            $response = in_str('response', 480);
            if ($response === '') fail('Напиши, что ответит бот');
            $access = in_str('access', 16, 'all');
            if (!in_array($access, ['all', 'followers', 'subs', 'vip', 'mods', 'list'], true)) $access = 'all';
            $dup = db_one('SELECT id FROM commands WHERE user_id = ? AND name = ? AND prefix = ? AND id <> ?', [$u['id'], $name, $prefix, $id]);
            if ($dup) fail('Команда ' . $prefix . $name . ' уже есть');
            $row = ['name' => $name, 'prefix' => $prefix, 'response' => $response, 'access' => $access, 'allow_list' => in_str('allowList', 1000),
                'cooldown_global' => in_int('cooldownGlobal', 30, 0, 3600), 'cooldown_user' => in_int('cooldownUser', 0, 0, 86400), 'description' => in_str('description', 200)];
            if ($id) {
                if (!db_one('SELECT id FROM commands WHERE id = ? AND user_id = ?', [$id, $u['id']])) fail('Команда не найдена', 404);
                db_update('commands', $row, 'id = ?', [$id]);
            } else {
                $count = (int)db_one('SELECT COUNT(*) c FROM commands WHERE user_id = ?', [$u['id']])['c'];
                if ($count >= plan_limits($u)['commands']) fail('На тарифе «' . plan_limits($u)['name'] . '» можно до ' . plan_limits($u)['commands'] . ' команд');
                $id = db_insert('commands', $row + ['user_id' => $u['id'], 'enabled' => 1, 'created_at' => now()]);
            }
            json_out(['ok' => true, 'item' => cmd_row(db_one('SELECT * FROM commands WHERE id = ?', [$id]))]);
        }
        case 'commands.toggle': {
            $u = require_user();
            $c = db_one('SELECT * FROM commands WHERE id = ? AND user_id = ?', [in_int('id'), $u['id']]);
            if (!$c) fail('Команда не найдена', 404);
            db_update('commands', ['enabled' => (int)$c['enabled'] ? 0 : 1], 'id = ?', [$c['id']]);
            json_out(['ok' => true]);
        }
        case 'commands.delete': {
            $u = require_user();
            db_exec('DELETE FROM commands WHERE id = ? AND user_id = ?', [in_int('id'), $u['id']]);
            json_out(['ok' => true]);
        }

        // ---------- музыка ----------
        case 'music.state': {
            $u = require_user();
            $uid = (int)$u['id'];
            $since = since_for($uid);
            json_out(['ok' => true, 'config' => music_config($uid), 'allowed' => plan_limits($u)['music'], 'youtube' => (bool)cfg('YOUTUBE_API_KEY'),
                'current' => ($c = db_one("SELECT * FROM songs WHERE user_id = ? AND status = 'playing' ORDER BY id DESC LIMIT 1", [$uid])) ? song_row($c) : null,
                'queue' => array_map('song_row', db_all("SELECT * FROM songs WHERE user_id = ? AND status = 'queued' ORDER BY pos, id", [$uid])),
                'pending' => array_map('song_row', db_all("SELECT * FROM songs WHERE user_id = ? AND status = 'pending' ORDER BY id", [$uid])),
                'history' => array_map('song_row', db_all("SELECT * FROM songs WHERE user_id = ? AND status IN ('played','skipped','rejected') ORDER BY played_at DESC, id DESC LIMIT 30", [$uid])),
                'stats' => ['ordered' => (int)db_one('SELECT COUNT(*) c FROM songs WHERE user_id = ? AND created_at >= ?', [$uid, $since])['c'],
                    'rejected' => (int)db_one("SELECT COUNT(*) c FROM songs WHERE user_id = ? AND status = 'rejected' AND created_at >= ?", [$uid, $since])['c']]]);
        }
        case 'music.action': {
            $u = require_user();
            $uid = (int)$u['id'];
            $act = in_str('action', 16);
            $id = in_int('id');
            $song = $id ? db_one('SELECT * FROM songs WHERE id = ? AND user_id = ?', [$id, $uid]) : null;
            switch ($act) {
                case 'next': music_next($u); break;
                case 'remove': if ($song) db_update('songs', ['status' => 'skipped', 'played_at' => now()], 'id = ?', [$id]); break;
                case 'up':
                    if ($song) {
                        $prev = db_one("SELECT * FROM songs WHERE user_id = ? AND status = 'queued' AND (pos < ? OR (pos = ? AND id < ?)) ORDER BY pos DESC, id DESC LIMIT 1", [$uid, $song['pos'], $song['pos'], $id]);
                        if ($prev) { db_update('songs', ['pos' => $prev['pos']], 'id = ?', [$id]); db_update('songs', ['pos' => $song['pos'] == $prev['pos'] ? $prev['pos'] + 1 : $song['pos']], 'id = ?', [$prev['id']]); }
                    }
                    break;
                case 'approve':
                    if ($song) { $pos = (int)(db_one("SELECT MAX(pos) m FROM songs WHERE user_id = ? AND status = 'queued'", [$uid])['m'] ?? 0) + 1; db_update('songs', ['status' => 'queued', 'pos' => $pos], 'id = ?', [$id]); }
                    break;
                case 'reject':
                    if ($song) { db_update('songs', ['status' => 'rejected', 'played_at' => now()], 'id = ?', [$id]); refund_redemption($u, $song); }
                    break;
                case 'clear': db_exec("UPDATE songs SET status = 'skipped' WHERE user_id = ? AND status = 'queued'", [$uid]); break;
                default: fail('Неизвестное действие');
            }
            json_out(['ok' => true]);
        }
        case 'music.add': {
            $u = require_user();
            if (!plan_limits($u)['music']) fail('Музыка доступна на тарифе «Про» и выше');
            $res = song_request($u, in_str('query', 300), $u['display_name'] ?: $u['login'], 'manual');
            if (!$res['ok']) fail($res['message']);
            json_out(['ok' => true, 'message' => $res['message']]);
        }
        case 'music.config': {
            $u = require_user();
            $uid = (int)$u['id'];
            $new = api_input()['config'] ?? [];
            if (!is_array($new)) fail('Нет настроек');
            $cur = music_config($uid);
            $cfg = array_replace_recursive($cur, $new);
            if (isset($new['stop'])) $cfg['stop'] = array_values(array_filter(array_map('strval', (array)$new['stop'])));
            $cfg['cmd']['name'] = mb_strtolower(ltrim(preg_replace('/\s+/u', '', (string)$cfg['cmd']['name']), '!')) ?: 'музыка';
            // награда за баллы канала
            $msg = null;
            if (!empty($cfg['points']['on'])) {
                $token = tw_user_token($u);
                $reward = ['title' => 'Заказать трек', 'cost' => max(1, (int)$cfg['points']['cost']), 'prompt' => 'Ссылка на YouTube или название трека', 'is_user_input_required' => true, 'is_enabled' => true];
                if ($token && empty($cfg['points']['rewardId'])) {
                    $r = helix('POST', 'channel_points/custom_rewards', ['broadcaster_id' => $u['twitch_id']], $reward, $token);
                    if ($r['code'] === 200) $cfg['points']['rewardId'] = $r['json']['data'][0]['id'];
                    else { $cfg['points']['on'] = false; $msg = 'Не удалось создать награду: ' . ($r['json']['message'] ?? 'баллы канала доступны только компаньонам и партнёрам Twitch'); }
                } elseif ($token) {
                    helix('PATCH', 'channel_points/custom_rewards', ['broadcaster_id' => $u['twitch_id'], 'id' => $cfg['points']['rewardId']], ['cost' => $reward['cost'], 'is_enabled' => true], $token);
                }
            } elseif (!empty($cur['points']['on']) && !empty($cfg['points']['rewardId']) && ($token = tw_user_token($u))) {
                helix('PATCH', 'channel_points/custom_rewards', ['broadcaster_id' => $u['twitch_id'], 'id' => $cfg['points']['rewardId']], ['is_enabled' => false], $token);
            }
            settings_set($uid, 'music', $cfg);
            json_out(['ok' => true, 'config' => $cfg, 'message' => $msg]);
        }

        // ---------- модерация ----------
        case 'mod.config': {
            $u = require_user();
            if ($_SERVER['REQUEST_METHOD'] === 'POST') {
                $new = api_input()['config'] ?? null;
                if (!is_array($new)) fail('Нет настроек');
                $cfg = array_replace_recursive(mod_config((int)$u['id']), $new);
                foreach (['ladder', 'words', 'domains'] as $k) if (isset($new[$k])) $cfg[$k] = array_values((array)$new[$k]);
                $cfg['ladder'] = array_slice(array_values(array_filter($cfg['ladder'], fn($s) => in_array($s['a'] ?? '', ['warn', 'delete', 'timeout', 'ban'], true))), 0, 6) ?: [['a' => 'warn']];
                settings_set((int)$u['id'], 'mod', $cfg);
            }
            json_out(['ok' => true, 'config' => mod_config((int)$u['id'])]);
        }
        case 'mod.journal': {
            $u = require_user();
            $type = in_str('type', 16);
            $rows = $type ? db_all('SELECT * FROM mod_actions WHERE user_id = ? AND action = ? ORDER BY id DESC LIMIT 100', [$u['id'], $type])
                : db_all("SELECT * FROM mod_actions WHERE user_id = ? AND action <> 'review' ORDER BY id DESC LIMIT 100", [$u['id']]);
            json_out(['ok' => true, 'items' => array_map('action_row', $rows)]);
        }
        case 'mod.undo': {
            $u = require_user();
            $a = db_one('SELECT * FROM mod_actions WHERE id = ? AND user_id = ?', [in_int('id'), $u['id']]);
            if (!$a) fail('Запись не найдена', 404);
            if (in_array($a['action'], ['timeout', 'ban'], true) && !tw_unban($u['twitch_id'], (string)$a['chatter_id'])) fail('Twitch не снял ограничение (возможно, оно уже истекло)');
            db_update('mod_actions', ['undone' => 1], 'id = ?', [$a['id']]);
            db_exec('DELETE FROM strikes WHERE user_id = ? AND chatter_id = ?', [$u['id'], $a['chatter_id']]);
            json_out(['ok' => true]);
        }
        case 'mod.review': {
            $u = require_user();
            if ($_SERVER['REQUEST_METHOD'] === 'POST') {
                $q = db_one('SELECT * FROM review_queue WHERE id = ? AND user_id = ?', [in_int('id'), $u['id']]);
                if (!$q) fail('Сообщение не найдено', 404);
                $act = in_str('action', 16);
                $ctx = ['chatterId' => $q['chatter_id'], 'login' => $q['chatter_login'], 'text' => $q['text']];
                if ($act === 'deny') { tw_delete_message($u['twitch_id'], (string)$q['msg_id']); log_action($u, $ctx, 'delete', $q['reason'], 0, $u['login']); }
                if ($act === 'timeout') { tw_ban($u['twitch_id'], (string)$q['chatter_id'], 600, 'StreOps: ' . $q['reason']); log_action($u, $ctx, 'timeout', $q['reason'], 600, $u['login']); }
                if ($act === 'ban') { tw_ban($u['twitch_id'], (string)$q['chatter_id'], 0, 'StreOps: ' . $q['reason']); log_action($u, $ctx, 'ban', $q['reason'], 0, $u['login']); }
                db_update('review_queue', ['status' => $act], 'id = ?', [$q['id']]);
            }
            $rows = db_all("SELECT * FROM review_queue WHERE user_id = ? AND status = 'new' ORDER BY id DESC LIMIT 50", [$u['id']]);
            json_out(['ok' => true, 'items' => array_map(fn($q) => ['id' => (int)$q['id'], 'login' => $q['chatter_login'], 'text' => $q['text'], 'reason' => $q['reason'], 'at' => (int)$q['created_at']], $rows)]);
        }
        case 'mod.stats': {
            $u = require_user();
            $uid = (int)$u['id'];
            $since = since_for($uid);
            $msgs = (int)db_one('SELECT COUNT(*) c FROM chat_messages WHERE user_id = ? AND created_at >= ?', [$uid, $since])['c'];
            $chatters = (int)db_one('SELECT COUNT(DISTINCT chatter_id) c FROM chat_messages WHERE user_id = ? AND created_at >= ?', [$uid, $since])['c'];
            $byAction = [];
            foreach (db_all('SELECT action, COUNT(*) c FROM mod_actions WHERE user_id = ? AND created_at >= ? GROUP BY action', [$uid, $since]) as $r) $byAction[$r['action']] = (int)$r['c'];
            $byReason = db_all("SELECT reason, COUNT(*) c FROM mod_actions WHERE user_id = ? AND created_at >= ? AND by_login = 'Бот' GROUP BY reason ORDER BY c DESC LIMIT 10", [$uid, $since]);
            $tox = (int)db_one("SELECT COUNT(*) c FROM mod_actions WHERE user_id = ? AND created_at >= ? AND by_login <> 'Бот' AND reason IN ('оскорбления','угрозы в чате')", [$uid, $since])['c'];
            $top = db_all('SELECT chatter_login, COUNT(*) c FROM chat_messages WHERE user_id = ? AND created_at >= ? GROUP BY chatter_login ORDER BY c DESC LIMIT 6', [$uid, $since]);
            foreach ($top as &$t) {
                $t['violations'] = (int)db_one('SELECT COUNT(*) c FROM mod_actions WHERE user_id = ? AND chatter_login = ? AND created_at >= ?', [$uid, $t['chatter_login'], $since])['c'];
            }
            unset($t);
            $watch = db_all('SELECT s.chatter_id, s.cnt, s.last_at, (SELECT chatter_login FROM mod_actions m WHERE m.user_id = s.user_id AND m.chatter_id = s.chatter_id ORDER BY id DESC LIMIT 1) login FROM strikes s WHERE s.user_id = ? AND s.last_at > ? ORDER BY s.cnt DESC LIMIT 5', [$uid, now() - 7 * 86400]);
            $from = now() - 3 * 3600;
            $b = array_fill(0, 18, ['m' => 0, 'v' => 0]);
            foreach (db_all('SELECT created_at FROM chat_messages WHERE user_id = ? AND created_at >= ?', [$uid, $from]) as $r) $b[min(17, intdiv((int)$r['created_at'] - $from, 600))]['m']++;
            foreach (db_all("SELECT created_at FROM mod_actions WHERE user_id = ? AND created_at >= ? AND action <> 'review'", [$uid, $from]) as $r) $b[min(17, intdiv((int)$r['created_at'] - $from, 600))]['v']++;
            json_out(['ok' => true, 'messages' => $msgs, 'chatters' => $chatters, 'actions' => $byAction, 'reasons' => $byReason,
                'toxIndex' => $msgs ? min(100, (int)round($tox / $msgs * 1000)) : 0, 'top' => $top, 'watch' => $watch, 'chart' => ['from' => $from, 'buckets' => $b]]);
        }
        case 'mod.chat': {
            $u = require_user();
            if ($_SERVER['REQUEST_METHOD'] === 'POST') {
                $mode = in_str('mode', 16);
                $on = in_bool('on');
                $map = ['slow' => ['slow_mode' => $on, 'slow_mode_wait_time' => $on ? 5 : null], 'followers' => ['follower_mode' => $on, 'follower_mode_duration' => $on ? 10 : null],
                    'subs' => ['subscriber_mode' => $on], 'emote' => ['emote_mode' => $on], 'unique' => ['unique_chat_mode' => $on]];
                if ($mode === 'shield') { if (!tw_shield($u['twitch_id'], $on)) fail('Twitch не включил режим щита. Бот должен быть модератором.'); }
                elseif (isset($map[$mode])) {
                    $patch = array_filter($map[$mode], fn($v) => $v !== null);
                    $r = tw_chat_settings($u['twitch_id'], $patch);
                    if (($r['code'] ?? 0) !== 200) fail('Twitch не изменил режим чата. Бот должен быть модератором.');
                } else fail('Неизвестный режим');
            }
            $b = bot_account();
            $st = $b ? bot_helix('GET', 'chat/settings', ['broadcaster_id' => $u['twitch_id'], 'moderator_id' => $b['id']]) : ['json' => null];
            $s = $st['json']['data'][0] ?? [];
            $sh = $b ? bot_helix('GET', 'moderation/shield_mode', ['broadcaster_id' => $u['twitch_id'], 'moderator_id' => $b['id']]) : ['json' => null];
            json_out(['ok' => true, 'modes' => ['slow' => (bool)($s['slow_mode'] ?? false), 'followers' => (bool)($s['follower_mode'] ?? false), 'subs' => (bool)($s['subscriber_mode'] ?? false),
                'emote' => (bool)($s['emote_mode'] ?? false), 'unique' => (bool)($s['unique_chat_mode'] ?? false), 'shield' => (bool)($sh['json']['data'][0]['is_active'] ?? false)], 'available' => (bool)$s]);
        }
        case 'mod.unban': {
            $u = require_user();
            $b = bot_account();
            if (!$b) json_out(['ok' => true, 'items' => []]);
            if ($_SERVER['REQUEST_METHOD'] === 'POST') {
                $r = bot_helix('PATCH', 'moderation/unban_requests', ['broadcaster_id' => $u['twitch_id'], 'moderator_id' => $b['id'], 'unban_request_id' => in_str('id', 64), 'status' => in_bool('approve') ? 'approved' : 'denied']);
                if ($r['code'] !== 200) fail('Twitch не обработал запрос');
            }
            $r = bot_helix('GET', 'moderation/unban_requests', ['broadcaster_id' => $u['twitch_id'], 'moderator_id' => $b['id'], 'status' => 'pending']);
            json_out(['ok' => true, 'items' => array_map(fn($x) => ['id' => $x['id'], 'login' => $x['user_login'], 'text' => $x['text'], 'at' => strtotime($x['created_at'])], $r['json']['data'] ?? [])]);
        }

        // ---------- розыгрыши ----------
        case 'gw.state': {
            $u = require_user();
            $gw = db_one("SELECT * FROM giveaways WHERE user_id = ? AND status IN ('collecting','closed','drawing') ORDER BY id DESC LIMIT 1", [$u['id']]);
            $hist = db_all("SELECT * FROM giveaways WHERE user_id = ? AND status IN ('done','cancelled') ORDER BY id DESC LIMIT 10", [$u['id']]);
            json_out(['ok' => true, 'current' => $gw ? gw_public($gw, true) : null, 'history' => array_map(fn($g) => gw_public($g, false), $hist)]);
        }
        case 'gw.start': {
            $u = require_user();
            if (db_one("SELECT id FROM giveaways WHERE user_id = ? AND status IN ('collecting','closed','drawing')", [$u['id']])) fail('Уже идёт розыгрыш');
            $seed = rand_token(16);
            $keyword = in_str('keyword', 40, '!участвую') ?: '!участвую';
            $rules = api_input()['rules'] ?? [];
            $entry = in_str('entry', 16, 'word');
            $dur = in_int('duration', 120, 0, 3600);
            $id = db_insert('giveaways', ['user_id' => $u['id'], 'prize' => in_str('prize', 200, 'Приз'), 'keyword' => $keyword, 'winners_count' => in_int('winners', 1, 1, 10),
                'rules' => json_encode(['entry' => $entry] + (is_array($rules) ? $rules : []), JSON_UNESCAPED_UNICODE), 'status' => 'collecting', 'seed' => $seed, 'seed_hash' => hash('sha256', $seed),
                'winners' => '[]', 'excluded' => '[]', 'created_at' => now(), 'ends_at' => $dur ? now() + $dur : 0]);
            $how = $entry === 'active' ? 'Участвуют все, кто пишет в чат' : 'Пиши ' . $keyword;
            tw_send($u['twitch_id'], 'Розыгрыш: ' . in_str('prize', 200, 'Приз') . '! ' . $how . ($dur ? ', сбор ' . human_dur($dur) : '') . '. Проверка честности: sha256 ' . substr(hash('sha256', $seed), 0, 12) . '…');
            json_out(['ok' => true, 'id' => $id]);
        }
        case 'gw.cancel': {
            $u = require_user();
            db_exec("UPDATE giveaways SET status = 'cancelled', drawn_at = ? WHERE user_id = ? AND status IN ('collecting','closed','drawing')", [now(), $u['id']]);
            json_out(['ok' => true]);
        }
        case 'gw.draw': {
            $u = require_user();
            $gw = db_one("SELECT * FROM giveaways WHERE user_id = ? AND status IN ('collecting','closed','drawing') ORDER BY id DESC LIMIT 1", [$u['id']]);
            if (!$gw) fail('Нет активного розыгрыша', 404);
            $winners = json_decode((string)$gw['winners'], true) ?: [];
            $excluded = json_decode((string)$gw['excluded'], true) ?: [];
            if (in_bool('reroll') && $winners) { $last = array_pop($winners); $excluded[] = $last['id']; }
            $skip = array_merge($excluded, array_column($winners, 'id'));
            $entries = db_all('SELECT * FROM giveaway_entries WHERE giveaway_id = ? ORDER BY id', [$gw['id']]);
            $pool = array_values(array_filter($entries, fn($e) => !in_array($e['chatter_id'], $skip, true)));
            if (!$pool) fail('Не осталось участников для выбора');
            $total = array_sum(array_map(fn($e) => (int)$e['weight'], $pool));
            $round = count($winners) + count($excluded);
            $x = hexdec(substr(hash('sha256', $gw['seed'] . ':' . $round), 0, 12)) % $total;
            $pick = $pool[0];
            foreach ($pool as $e) { $x -= (int)$e['weight']; if ($x < 0) { $pick = $e; break; } }
            $w = ['id' => $pick['chatter_id'], 'login' => $pick['login'], 'name' => $pick['display'], 'role' => $pick['role'], 'weight' => (int)$pick['weight'],
                'chance' => round((int)$pick['weight'] / $total * 100, 2), 'at' => now(), 'round' => $round];
            $winners[] = $w;
            db_update('giveaways', ['status' => 'drawing', 'winners' => json_encode($winners, JSON_UNESCAPED_UNICODE), 'excluded' => json_encode($excluded)], 'id = ?', [$gw['id']]);
            $rules = json_decode((string)$gw['rules'], true) ?: [];
            json_out(['ok' => true, 'winner' => $w, 'pool' => array_map(fn($e) => ['login' => $e['login'], 'name' => $e['display'], 'role' => $e['role']], array_slice($pool, 0, 60)), 'announce' => !empty($rules['confirm'])]);
        }
        case 'gw.announce': {
            $u = require_user();
            $gw = db_one("SELECT * FROM giveaways WHERE user_id = ? AND status = 'drawing' ORDER BY id DESC LIMIT 1", [$u['id']]);
            if (!$gw) fail('Нет розыгрыша', 404);
            $winners = json_decode((string)$gw['winners'], true) ?: [];
            $w = end($winners);
            $rules = json_decode((string)$gw['rules'], true) ?: [];
            if ($w) tw_send($u['twitch_id'], '@' . $w['name'] . ', ты выиграл «' . $gw['prize'] . '»!' . (!empty($rules['confirm']) ? ' Напиши что-нибудь в чат за 60 секунд, чтобы забрать приз.' : ''));
            json_out(['ok' => true]);
        }
        case 'gw.finish': {
            $u = require_user();
            $gw = db_one("SELECT * FROM giveaways WHERE user_id = ? AND status IN ('collecting','closed','drawing') ORDER BY id DESC LIMIT 1", [$u['id']]);
            if (!$gw) fail('Нет розыгрыша', 404);
            db_update('giveaways', ['status' => 'done', 'drawn_at' => now()], 'id = ?', [$gw['id']]);
            $names = implode(', ', array_column(json_decode((string)$gw['winners'], true) ?: [], 'name'));
            if ($names) tw_send($u['twitch_id'], 'Розыгрыш «' . $gw['prize'] . '» завершён. Победители: ' . $names . '. Seed для проверки: ' . $gw['seed']);
            json_out(['ok' => true]);
        }

        // ---------- виджеты ----------
        case 'widgets.get': {
            $u = require_user();
            json_out(['ok' => true, 'data' => settings_get((int)$u['id'], 'widgets', null), 'token' => $u['widget_token'], 'limit' => plan_limits($u)['widgets']]);
        }
        case 'widgets.save': {
            $u = require_user();
            $data = api_input()['data'] ?? null;
            if (!is_array($data)) fail('Нет данных');
            $on = array_filter((array)($data['on'] ?? []));
            if (count($on) > plan_limits($u)['widgets']) fail('На тарифе «' . plan_limits($u)['name'] . '» можно включить до ' . plan_limits($u)['widgets'] . ' виджетов');
            $prev = settings_get((int)$u['id'], 'widgets', ['cfg' => []]);
            foreach (['goal', 'subgoal'] as $g) { // точка отсчёта для целей
                if (isset($data['cfg'][$g]) && empty($data['cfg'][$g]['since'])) $data['cfg'][$g]['since'] = $prev['cfg'][$g]['since'] ?? now();
            }
            settings_set((int)$u['id'], 'widgets', ['on' => $on, 'cfg' => (array)($data['cfg'] ?? [])]);
            json_out(['ok' => true]);
        }
        case 'player.next': { // плеер музыки (панель или OBS /w/player.php): трек доиграл, либо очередь ждёт запуска
            $u = db_one('SELECT * FROM users WHERE widget_token = ?', [in_str('t', 64)]);
            if (!$u || (int)$u['banned']) fail('Плеер не найден', 404);
            $cur = db_one("SELECT id FROM songs WHERE user_id = ? AND status = 'playing' ORDER BY id DESC LIMIT 1", [$u['id']]);
            $finished = in_int('finished');
            // переключаем, только если доиграл именно текущий трек: два открытых плеера не пропустят трек дважды
            if (($cur && (int)$cur['id'] === $finished) || (!$cur && $finished === 0)) music_next($u);
            $c = db_one("SELECT * FROM songs WHERE user_id = ? AND status = 'playing' ORDER BY id DESC LIMIT 1", [$u['id']]);
            json_out(['ok' => true, 'current' => $c ? song_row($c) : null, 'volume' => (int)music_config((int)$u['id'])['volume']]);
        }
        case 'widget.data': {
            $u = db_one('SELECT * FROM users WHERE widget_token = ?', [in_str('t', 64)]);
            if (!$u || (int)$u['banned']) fail('Виджет не найден', 404);
            json_out(['ok' => true] + widget_payload($u, in_str('w', 16), in_int('after')));
        }

        // ---------- аккаунт ----------
        case 'plans': { // тарифы для страниц сайта — один источник с серверными лимитами
            json_out(['ok' => true, 'items' => array_map(fn($k, $p) => ['key' => $k] + $p, array_keys(PLANS), PLANS)]);
        }
        case 'account.transactions': {
            $u = require_user();
            $rows = db_all('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50', [$u['id']]);
            json_out(['ok' => true, 'items' => array_map(fn($t) => ['id' => (int)$t['id'], 'amount' => (int)$t['amount'], 'kind' => $t['kind'], 'comment' => $t['comment'], 'at' => (int)$t['created_at']], $rows)]);
        }
        case 'account.buy': {
            $u = require_user();
            $plan = in_str('plan', 16);
            if (!isset(PLANS[$plan]) || $plan === 'free') fail('Нет такого тарифа');
            $price = PLANS[$plan]['price'];
            if ((int)$u['balance'] < $price) fail('Не хватает ' . ($price - (int)$u['balance']) . ' ₽ на балансе');
            $base = plan_of($u) === $plan && (int)$u['plan_until'] > now() ? (int)$u['plan_until'] : now();
            db_update('users', ['balance' => (int)$u['balance'] - $price, 'plan' => $plan, 'plan_until' => $base + 30 * 86400], 'id = ?', [$u['id']]);
            add_transaction((int)$u['id'], -$price, 'plan', 'Оплата тарифа «' . PLANS[$plan]['name'] . '» на 30 дней');
            json_out(['ok' => true]);
        }
        case 'account.theme': {
            $u = require_user();
            if ($_SERVER['REQUEST_METHOD'] === 'POST') {
                $t = api_input()['theme'] ?? null;
                if (is_array($t)) { unset($t['image']); db_update('users', ['theme' => json_encode($t, JSON_UNESCAPED_UNICODE)], 'id = ?', [$u['id']]); }
            }
            json_out(['ok' => true, 'theme' => json_decode((string)$u['theme'], true)]);
        }
        case 'account.da.disconnect': {
            $u = require_user();
            db_update('users', ['da_access' => null, 'da_refresh' => null, 'da_expires' => 0, 'da_name' => null], 'id = ?', [$u['id']]);
            json_out(['ok' => true]);
        }
        case 'account.widgetToken': {
            $u = require_user();
            db_update('users', ['widget_token' => rand_token(12)], 'id = ?', [$u['id']]);
            json_out(['ok' => true]);
        }
        case 'account.delete': {
            $u = require_user();
            if (strtolower(in_str('confirm', 64)) !== strtolower($u['login'])) fail('Введи свой ник для подтверждения');
            if ((int)$u['bot_enabled']) eventsub_remove_channel($u);
            foreach (['commands', 'settings', 'chat_messages', 'mod_actions', 'strikes', 'review_queue', 'songs', 'donations', 'events', 'streams', 'counters', 'follow_cache', 'gsi'] as $t) db_exec("DELETE FROM $t WHERE user_id = ?", [$u['id']]);
            db_exec('DELETE FROM giveaway_entries WHERE giveaway_id IN (SELECT id FROM giveaways WHERE user_id = ?)', [$u['id']]);
            db_exec('DELETE FROM giveaways WHERE user_id = ?', [$u['id']]);
            db_exec('DELETE FROM users WHERE id = ?', [$u['id']]);
            $_SESSION = [];
            json_out(['ok' => true]);
        }

        // ---------- админ-панель ----------
        case 'admin.stats': {
            require_admin();
            $b = bot_account();
            $subs = $b && !empty($b['own_app']) ? eventsub_list() : [];
            $byStatus = [];
            foreach ($subs as $s) $byStatus[$s['status']] = ($byStatus[$s['status']] ?? 0) + 1;
            json_out(['ok' => true,
                'users' => (int)db_one('SELECT COUNT(*) c FROM users')['c'],
                'paid' => (int)db_one("SELECT COUNT(*) c FROM users WHERE plan <> 'free' AND (plan_until = 0 OR plan_until > ?)", [now()])['c'],
                'botChannels' => (int)db_one('SELECT COUNT(*) c FROM users WHERE bot_enabled = 1')['c'],
                'live' => (int)db_one('SELECT COUNT(*) c FROM streams WHERE live = 1')['c'],
                'balances' => (int)db_one('SELECT COALESCE(SUM(balance),0) s FROM users')['s'],
                'income30' => -(int)db_one("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE kind = 'plan' AND created_at > ?", [now() - 30 * 86400])['s'],
                'bot' => $b ? ['login' => $b['login'], 'ownApp' => !empty($b['own_app'])] : null,
                'eventsub' => ['total' => count($subs), 'byStatus' => (object)$byStatus],
                'cronLast' => (int)(kv_get('cron_last') ?? 0),
                'config' => ['appUrl' => base_url(), 'youtube' => (bool)cfg('YOUTUBE_API_KEY'), 'da' => (bool)cfg('DA_CLIENT_ID'), 'faceit' => (bool)cfg('FACEIT_API_KEY')]]);
        }
        case 'admin.users': {
            require_admin();
            $q = in_str('q', 64);
            $rows = $q !== '' ? db_all('SELECT * FROM users WHERE login LIKE ? OR display_name LIKE ? ORDER BY id DESC LIMIT 100', ['%' . $q . '%', '%' . $q . '%'])
                : db_all('SELECT * FROM users ORDER BY id DESC LIMIT 100');
            json_out(['ok' => true, 'items' => array_map(fn($x) => user_public($x) + ['twitchId' => $x['twitch_id'], 'banned' => (bool)$x['banned'], 'lastLogin' => (int)$x['last_login'], 'rawPlan' => $x['plan']], $rows)]);
        }
        case 'admin.user': {
            $admin = require_admin();
            $id = in_int('id');
            $x = db_one('SELECT * FROM users WHERE id = ?', [$id]);
            if (!$x) fail('Пользователь не найден', 404);
            $in = api_input();
            $patch = [];
            $comment = in_str('comment', 200);
            if (isset($in['plan'])) {
                $plan = (string)$in['plan'];
                if (!isset(PLANS[$plan])) fail('Нет такого тарифа');
                $days = in_int('days', 30, 0, 3650);
                $patch['plan'] = $plan;
                $base = plan_of($x) === $plan && (int)$x['plan_until'] > now() ? (int)$x['plan_until'] : now();
                $patch['plan_until'] = $plan === 'free' ? 0 : ($days ? $base + $days * 86400 : 0);
                add_transaction($id, 0, 'grant', 'Тариф «' . PLANS[$plan]['name'] . '»' . ($plan !== 'free' ? ($days ? ' на ' . $days . ' дн.' : ' бессрочно') : '') . ($comment ? ' · ' . $comment : ''), $admin['login']);
            }
            if (isset($in['balanceDelta']) && (int)$in['balanceDelta'] !== 0) {
                $d = max(-1000000, min(1000000, (int)$in['balanceDelta']));
                $patch['balance'] = (int)$x['balance'] + $d;
                add_transaction($id, $d, $d > 0 ? 'topup' : 'charge', ($d > 0 ? 'Начисление' : 'Списание') . ' администратором' . ($comment ? ' · ' . $comment : ''), $admin['login']);
            }
            if (isset($in['banned'])) {
                $patch['banned'] = in_bool('banned') ? 1 : 0;
                if ($patch['banned'] && (int)$x['bot_enabled']) { eventsub_remove_channel($x); $patch['bot_enabled'] = 0; }
                add_transaction($id, 0, 'ban', ($patch['banned'] ? 'Заблокирован' : 'Разблокирован') . ($comment ? ' · ' . $comment : ''), $admin['login']);
            }
            if ($patch) db_update('users', $patch, 'id = ?', [$id]);
            json_out(['ok' => true]);
        }
        case 'admin.transactions': {
            require_admin();
            $rows = db_all('SELECT t.*, u.login FROM transactions t LEFT JOIN users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT 100');
            json_out(['ok' => true, 'items' => array_map(fn($t) => ['id' => (int)$t['id'], 'login' => $t['login'], 'amount' => (int)$t['amount'], 'kind' => $t['kind'], 'comment' => $t['comment'], 'admin' => $t['admin_login'], 'at' => (int)$t['created_at']], $rows)]);
        }
        case 'admin.eventsub': {
            require_admin();
            if ($_SERVER['REQUEST_METHOD'] === 'POST') {
                $act = in_str('action', 16);
                if ($act === 'purge') foreach (eventsub_list() as $s) if ($s['status'] !== 'enabled') eventsub_delete($s['id']);
                if ($act === 'resync') {
                    $existing = eventsub_list();
                    foreach (db_all('SELECT * FROM users WHERE bot_enabled = 1 AND banned = 0') as $x) {
                        $err = eventsub_ensure_channel($x, $existing);
                        db_update('users', ['bot_error' => $err ? implode('; ', $err) : null], 'id = ?', [$x['id']]);
                    }
                }
            }
            $logins = [];
            foreach (db_all('SELECT twitch_id, login FROM users') as $x) $logins[$x['twitch_id']] = $x['login'];
            json_out(['ok' => true, 'items' => array_map(fn($s) => ['id' => $s['id'], 'type' => $s['type'], 'status' => $s['status'], 'channel' => $logins[$s['condition']['broadcaster_user_id'] ?? ''] ?? ($s['condition']['broadcaster_user_id'] ?? ''), 'at' => strtotime($s['created_at'])], eventsub_list())]);
        }
    }
    fail('Неизвестный запрос: ' . $r, 404);
}

function gw_public(array $g, bool $withEntries): array {
    $rules = json_decode((string)$g['rules'], true) ?: [];
    $out = ['id' => (int)$g['id'], 'prize' => $g['prize'], 'keyword' => $g['keyword'], 'winnersCount' => (int)$g['winners_count'], 'rules' => $rules, 'status' => $g['status'],
        'seedHash' => $g['seed_hash'], 'seed' => in_array($g['status'], ['done', 'cancelled'], true) ? $g['seed'] : null,
        'winners' => json_decode((string)$g['winners'], true) ?: [], 'createdAt' => (int)$g['created_at'], 'endsAt' => (int)$g['ends_at'], 'drawnAt' => (int)$g['drawn_at'],
        'count' => (int)db_one('SELECT COUNT(*) c FROM giveaway_entries WHERE giveaway_id = ?', [$g['id']])['c']];
    if ($withEntries) {
        $total = (int)db_one('SELECT COALESCE(SUM(weight),0) s FROM giveaway_entries WHERE giveaway_id = ?', [$g['id']])['s'];
        $out['entries'] = array_map(fn($e) => ['login' => $e['login'], 'name' => $e['display'], 'role' => $e['role'], 'weight' => (int)$e['weight'], 'chance' => $total ? round((int)$e['weight'] / $total * 100, 2) : 0],
            db_all('SELECT * FROM giveaway_entries WHERE giveaway_id = ? ORDER BY id DESC LIMIT 60', [$g['id']]));
        // ответил ли последний победитель в чате после выбора
        $last = end($out['winners']);
        $out['lastReplied'] = $last ? (bool)db_one('SELECT id FROM chat_messages WHERE user_id = ? AND chatter_id = ? AND created_at >= ?', [$g['user_id'], $last['id'], (int)$last['at']]) : false;
    }
    return $out;
}

// Данные для OBS-виджета
function widget_payload(array $u, string $w, int $after): array {
    $uid = (int)$u['id'];
    $all = settings_get($uid, 'widgets', ['on' => [], 'cfg' => []]);
    $cfg = $all['cfg'][$w] ?? [];
    $on = !empty($all['on'][$w]);
    $data = [];
    switch ($w) {
        case 'alerts':
            $rows = db_all("SELECT * FROM events WHERE user_id = ? AND id > ? AND type IN ('follow','sub','resub','gift','raid','donation') ORDER BY id LIMIT 10", [$uid, $after]);
            if ($after === 0) $rows = []; // первый запрос — только узнать курсор
            $data['items'] = array_map('event_row', $rows);
            $data['cursor'] = (int)(db_one('SELECT MAX(id) m FROM events WHERE user_id = ?', [$uid])['m'] ?? 0);
            break;
        case 'goal':
            $base = (int)($cfg['content']['current'] ?? 0);
            $sum = (int)db_one('SELECT COALESCE(SUM(amount),0) s FROM donations WHERE user_id = ? AND created_at >= ?', [$uid, (int)($cfg['since'] ?? 0)])['s'];
            $data['current'] = $base + $sum;
            break;
        case 'subgoal':
            $base = (int)($cfg['content']['current'] ?? 0);
            $n = (int)db_one("SELECT COUNT(*) c FROM events WHERE user_id = ? AND type IN ('sub','resub','gift') AND created_at >= ?", [$uid, (int)($cfg['since'] ?? 0)])['c'];
            $data['current'] = $base + $n;
            break;
        case 'chat':
            $rows = db_all('SELECT * FROM chat_messages WHERE user_id = ? AND deleted = 0 AND id > ? ORDER BY id DESC LIMIT 30', [$uid, $after]);
            $data['items'] = array_map('msg_row', array_reverse($rows));
            $data['deleted'] = array_column(db_all('SELECT msg_id FROM chat_messages WHERE user_id = ? AND deleted = 1 AND created_at > ?', [$uid, now() - 600]), 'msg_id');
            break;
        case 'events':
            $data['items'] = array_map('event_row', db_all("SELECT * FROM events WHERE user_id = ? AND type IN ('follow','sub','resub','gift','raid','donation') ORDER BY id DESC LIMIT 5", [$uid]));
            break;
        case 'topdon':
            $period = $cfg['content']['period'] ?? 'month';
            $since = $period === 'stream' ? since_for($uid) : now() - ($period === 'week' ? 7 : 30) * 86400;
            $data['items'] = db_all('SELECT username, SUM(amount) total FROM donations WHERE user_id = ? AND created_at >= ? GROUP BY username ORDER BY total DESC LIMIT 5', [$uid, $since]);
            break;
        case 'np':
            $c = db_one("SELECT * FROM songs WHERE user_id = ? AND status = 'playing' ORDER BY id DESC LIMIT 1", [$uid]);
            $data['current'] = $c ? song_row($c) : null;
            $data['queued'] = (int)db_one("SELECT COUNT(*) c FROM songs WHERE user_id = ? AND status = 'queued'", [$uid])['c'];
            $data['volume'] = (int)music_config($uid)['volume'];
            break;
        case 'queue':
            $data['items'] = array_map('song_row', db_all("SELECT * FROM songs WHERE user_id = ? AND status = 'queued' ORDER BY pos, id LIMIT 5", [$uid]));
            break;
        case 'uptime':
            $data['stream'] = stream_row($uid);
            break;
        case 'deaths':
            $data['value'] = (int)(db_one('SELECT value FROM counters WHERE user_id = ? AND name = ?', [$uid, 'deaths'])['value'] ?? ($cfg['content']['value'] ?? 0));
            break;
        case 'cs':
        case 'dota':
            $g = db_one('SELECT data, updated_at FROM gsi WHERE user_id = ? AND game = ?', [$uid, $w]);
            $data['gsi'] = $g ? json_decode((string)$g['data'], true) : null;
            $data['updatedAt'] = $g ? (int)$g['updated_at'] : 0;
            break;
        case 'giveaway': // оверлей розыгрыша /w/giveaway.php: активный розыгрыш или только что завершённый
            $g = db_one("SELECT * FROM giveaways WHERE user_id = ? AND (status IN ('collecting','closed','drawing') OR (status = 'done' AND drawn_at > ?)) ORDER BY id DESC LIMIT 1", [$uid, now() - 90]);
            $data['giveaway'] = $g ? gw_public($g, true) : null;
            break;
        case 'faceit':
        case 'fmatch':
            $data['faceit'] = faceit_stats((string)($cfg['content']['nick'] ?? ''), $uid);
            break;
    }
    return ['widget' => $w, 'on' => $on, 'cfg' => $cfg, 'data' => $data, 'stream' => stream_row($uid), 'now' => now()];
}

function faceit_stats(string $nick, int $uid): ?array {
    $key = cfg('FACEIT_API_KEY');
    if (!$key || $nick === '') return null;
    $ck = 'faceit:' . mb_strtolower($nick);
    if ($c = kv_get($ck)) return $c;
    $r = http_request('GET', 'https://open.faceit.com/data/v4/players?' . http_build_query(['nickname' => $nick]), ['Authorization' => 'Bearer ' . $key]);
    $p = $r['json'] ?? null;
    if (!$p || empty($p['player_id'])) return null;
    $g = $p['games']['cs2'] ?? $p['games']['csgo'] ?? [];
    $elo = (int)($g['faceit_elo'] ?? 0);
    $st = stream_row($uid);
    $startKey = 'faceit_start:' . $uid . ':' . $st['startedAt'];
    $start = kv_get($startKey);
    if ($start === null) { $start = $elo; kv_set($startKey, $elo, 2 * 86400); }
    $out = ['nick' => $p['nickname'], 'level' => (int)($g['skill_level'] ?? 0), 'elo' => $elo, 'delta' => $elo - (int)$start];
    $h = http_request('GET', 'https://open.faceit.com/data/v4/players/' . $p['player_id'] . '/history?game=cs2&limit=5', ['Authorization' => 'Bearer ' . $key]);
    $out['last5'] = [];
    foreach ($h['json']['items'] ?? [] as $m) {
        $team = null;
        foreach (($m['teams'] ?? []) as $tk => $t) foreach (($t['players'] ?? []) as $pl) if (($pl['player_id'] ?? '') === $p['player_id']) $team = $tk;
        $out['last5'][] = ($m['results']['winner'] ?? '') === $team ? 'W' : 'L';
    }
    kv_set($ck, $out, 60);
    return $out;
}
