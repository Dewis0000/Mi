<?php
// Возврат с Twitch: вход стримера или подключение аккаунта бота.
require __DIR__ . '/../_app.php';
session_boot();
$o = $_SESSION['oauth'] ?? null;
unset($_SESSION['oauth']);
if (!$o || !hash_equals((string)$o['state'], (string)($_GET['state'] ?? ''))) { http_response_code(400); exit('Ссылка устарела. Вернись на сайт и попробуй войти ещё раз.'); }
if (isset($_GET['error'])) redirect('/?auth=cancelled');
$tok = tw_exchange_code((string)($_GET['code'] ?? ''));
if (!$tok) { http_response_code(502); exit('Twitch не подтвердил вход. Попробуй ещё раз.'); }
$r = helix('GET', 'users', null, null, $tok['access_token']);
$tu = $r['json']['data'][0] ?? null;
if (!$tu) { http_response_code(502); exit('Не удалось получить профиль Twitch.'); }

if ($o['kind'] === 'bot') {
    if (!is_admin(current_user())) { http_response_code(403); exit('Только для администратора'); }
    $expected = strtolower((string)cfg('BOT_LOGIN', 'streopsbot'));
    if (strtolower($tu['login']) !== $expected) { http_response_code(400); exit('Нужно войти аккаунтом бота ' . htmlspecialchars($expected) . ', а вошёл ' . htmlspecialchars($tu['login']) . '. Выйди из Twitch и попробуй снова.'); }
    kv_set('bot_account', ['id' => $tu['id'], 'login' => $tu['login'], 'access_token' => $tok['access_token'], 'refresh_token' => $tok['refresh_token'] ?? '', 'expires' => now() + (int)($tok['expires_in'] ?? 3600), 'scopes' => $tok['scope'] ?? []]);
    kv_set('bot_env_validated', null, 1);
    $existing = eventsub_list();
    foreach (db_all('SELECT * FROM users WHERE bot_enabled = 1') as $u) {
        $err = eventsub_ensure_channel($u, $existing);
        db_update('users', ['bot_error' => $err ? implode('; ', $err) : null], 'id = ?', [$u['id']]);
    }
    redirect('/admin.html?bot=connected');
}

$user = db_one('SELECT * FROM users WHERE twitch_id = ?', [$tu['id']]);
$row = [
    'login' => $tu['login'], 'display_name' => $tu['display_name'], 'avatar' => $tu['profile_image_url'] ?? '', 'email' => $tu['email'] ?? null,
    'access_token' => $tok['access_token'], 'refresh_token' => $tok['refresh_token'] ?? '', 'token_expires' => now() + (int)($tok['expires_in'] ?? 3600),
    'scopes' => implode(' ', (array)($tok['scope'] ?? [])), 'last_login' => now(),
];
if ($user) {
    db_update('users', $row, 'id = ?', [$user['id']]);
    $uid = (int)$user['id'];
} else {
    $uid = db_insert('users', $row + ['twitch_id' => $tu['id'], 'plan' => 'free', 'widget_token' => rand_token(12), 'created_at' => now()]);
    // стартовые команды
    foreach ([
        ['аптайм', 'Стрим идёт {uptime}', 'Сколько идёт стрим', 10],
        ['команды', 'Команды канала: !аптайм, !трек, !очередь', 'Список команд', 30],
        ['время', 'Сейчас {time}', 'Текущее время', 10],
    ] as [$n, $resp, $desc, $cd]) {
        db_insert('commands', ['user_id' => $uid, 'name' => $n, 'prefix' => '!', 'response' => $resp, 'description' => $desc, 'cooldown_global' => $cd, 'enabled' => 1, 'access' => 'all', 'created_at' => now()]);
    }
}
session_regenerate_id(true);
$_SESSION['uid'] = $uid;
redirect($o['next'] ?: '/panel.html');
