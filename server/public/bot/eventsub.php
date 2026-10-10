<?php
// Приём событий Twitch EventSub (вебхук): сообщения чата, подписки, рейды, начало и конец стрима, фолловы.
require __DIR__ . '/../_app.php';

$body = (string)file_get_contents('php://input');
$h = fn(string $n) => (string)($_SERVER['HTTP_' . strtoupper(str_replace('-', '_', $n))] ?? '');
$msgId = $h('Twitch-Eventsub-Message-Id');
$ts = $h('Twitch-Eventsub-Message-Timestamp');
$sig = $h('Twitch-Eventsub-Message-Signature');
$type = $h('Twitch-Eventsub-Message-Type');

$expected = 'sha256=' . hash_hmac('sha256', $msgId . $ts . $body, eventsub_secret());
if ($msgId === '' || !hash_equals($expected, $sig)) { http_response_code(403); exit('bad signature'); }
if (abs(time() - (int)strtotime($ts)) > 600) { http_response_code(403); exit('stale'); }

$data = json_decode($body, true) ?: [];

if ($type === 'webhook_callback_verification') {
    header('Content-Type: text/plain');
    echo $data['challenge'] ?? '';
    exit;
}

// повторная доставка того же события — игнорируем
try { db_insert('eventsub_seen', ['msg_id' => $msgId, 'created_at' => now()]); }
catch (Throwable $e) { http_response_code(204); exit; }

$subType = (string)($data['subscription']['type'] ?? '');
$ev = $data['event'] ?? [];
$bid = (string)($data['subscription']['condition']['broadcaster_user_id'] ?? $ev['broadcaster_user_id'] ?? '');

if ($type === 'revocation') {
    logline('eventsub', "revoked $subType for $bid: " . ($data['subscription']['status'] ?? ''));
    if (in_array($subType, ['channel.chat.message', 'channel.chat.notification'], true)) {
        db_exec('UPDATE users SET bot_error = ? WHERE twitch_id = ?', ['Twitch отозвал доступ бота (' . ($data['subscription']['status'] ?? '') . '). Включи бота заново в настройках.', $bid]);
    }
    http_response_code(204);
    exit;
}

// отвечаем Twitch сразу, обработку делаем после (Twitch ждёт ответ не дольше нескольких секунд)
http_response_code(204);
header('Content-Length: 0');
header('Connection: close');
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
else { ignore_user_abort(true); @ob_end_flush(); flush(); }

$user = db_one('SELECT * FROM users WHERE twitch_id = ?', [$bid]);
if (!$user || (int)$user['banned']) exit;

try {
    switch ($subType) {
        case 'channel.chat.message':
            if ((int)$user['bot_enabled']) bot_handle_message($user, $ev);
            break;
        case 'channel.chat.notification':
            bot_handle_notification($user, $ev);
            break;
        case 'channel.channel_points_custom_reward_redemption.add':
            if ((int)$user['bot_enabled']) bot_on_redemption($user, $ev);
            break;
        case 'channel.follow':
            db_insert('events', ['user_id' => $user['id'], 'type' => 'follow', 'login' => $ev['user_login'] ?? '', 'name' => $ev['user_name'] ?? '', 'data' => '{}', 'created_at' => now()]);
            db_exec('DELETE FROM follow_cache WHERE user_id = ? AND chatter_id = ?', [$user['id'], (string)($ev['user_id'] ?? '')]);
            break;
        case 'channel.moderate':
            $act = (string)($ev['action'] ?? '');
            $map = ['ban' => 'ban', 'timeout' => 'timeout', 'delete' => 'delete', 'unban' => 'unban', 'untimeout' => 'unban', 'warn' => 'warn'];
            $b = bot_account();
            if (isset($map[$act]) && ($ev['moderator_user_id'] ?? '') !== ($b['id'] ?? '')) {
                $p = $ev[$act] ?? [];
                db_insert('mod_actions', [
                    'user_id' => $user['id'], 'chatter_id' => (string)($p['user_id'] ?? ''), 'chatter_login' => (string)($p['user_login'] ?? ''),
                    'action' => $map[$act], 'reason' => (string)($p['reason'] ?? ($act === 'delete' ? 'удалено вручную' : '')),
                    'duration' => isset($p['expires_at']) ? max(0, (int)strtotime($p['expires_at']) - now()) : 0,
                    'by_login' => (string)($ev['moderator_user_login'] ?? ''), 'message' => (string)($p['message_body'] ?? ''), 'strikes' => '', 'created_at' => now(),
                ]);
            }
            break;
        case 'stream.online':
            $s = helix('GET', 'streams', ['user_id' => $bid])['json']['data'][0] ?? [];
            db_exec('DELETE FROM streams WHERE user_id = ?', [$user['id']]);
            db_insert('streams', ['user_id' => $user['id'], 'live' => 1, 'started_at' => strtotime((string)($ev['started_at'] ?? 'now')) ?: now(),
                'viewers' => (int)($s['viewer_count'] ?? 0), 'peak' => (int)($s['viewer_count'] ?? 0), 'title' => $s['title'] ?? '', 'game' => $s['game_name'] ?? '',
                'thumbnail' => $s['thumbnail_url'] ?? '', 'updated_at' => now()]);
            break;
        case 'stream.offline':
            db_exec('UPDATE streams SET live = 0, updated_at = ? WHERE user_id = ?', [now(), $user['id']]);
            break;
    }
} catch (Throwable $e) {
    logline('eventsub', $subType . ' error: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
}
