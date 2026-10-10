<?php
// Подключение DonationAlerts к аккаунту стримера.
require __DIR__ . '/../_app.php';
session_boot();
$u = current_user();
if (!$u) redirect('/auth/login.php?next=/settings.html');
if (!cfg('DA_CLIENT_ID')) { http_response_code(500); exit('DonationAlerts не настроен на сервере: нет DA_CLIENT_ID в .env'); }
if (!isset($_GET['code'])) {
    $state = rand_token();
    $_SESSION['da_state'] = $state;
    redirect(da_auth_url($state));
}
if (!hash_equals((string)($_SESSION['da_state'] ?? ''), (string)($_GET['state'] ?? ''))) { http_response_code(400); exit('Ссылка устарела'); }
$t = da_token(['grant_type' => 'authorization_code', 'code' => (string)$_GET['code'], 'redirect_uri' => da_redirect()]);
if (!$t) { http_response_code(502); exit('DonationAlerts не подтвердил подключение'); }
$me = http_request('GET', 'https://www.donationalerts.com/api/v1/user/oauth', ['Authorization' => 'Bearer ' . $t['access_token']]);
$list = http_request('GET', 'https://www.donationalerts.com/api/v1/alerts/donations', ['Authorization' => 'Bearer ' . $t['access_token']]);
$last = 0;
foreach ($list['json']['data'] ?? [] as $d) $last = max($last, (int)$d['id']);
db_update('users', ['da_access' => $t['access_token'], 'da_refresh' => $t['refresh_token'] ?? '', 'da_expires' => now() + (int)($t['expires_in'] ?? 3600),
    'da_last_id' => $last, 'da_name' => $me['json']['data']['name'] ?? ''], 'id = ?', [$u['id']]);
redirect('/settings.html?da=connected#platforms');
