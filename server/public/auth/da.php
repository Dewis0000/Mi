<?php
// Подключение DonationAlerts к аккаунту стримера.
require __DIR__ . '/../_app.php';
session_boot();
$u = current_user();
if (!$u) redirect('/auth/login.php?next=/settings.html');
// возврат на страницу настроек с причиной: страница показывает понятное сообщение
$back = fn(string $reason) => redirect('/settings.html?da=error&reason=' . $reason . '#platforms');
if (isset($_GET['error'])) $back('denied'); // пользователь отказал в DonationAlerts — без этого цикл авторизации
if (!cfg('DA_CLIENT_ID')) $back('config');
if (!isset($_GET['code'])) {
    $state = rand_token();
    $_SESSION['da_state'] = $state;
    redirect(da_auth_url($state));
}
if (!hash_equals((string)($_SESSION['da_state'] ?? ''), (string)($_GET['state'] ?? ''))) $back('state');
$t = da_token(['grant_type' => 'authorization_code', 'code' => (string)$_GET['code'], 'redirect_uri' => da_redirect()]);
if (!$t) $back('token');
$me = http_request('GET', 'https://www.donationalerts.com/api/v1/user/oauth', ['Authorization' => 'Bearer ' . $t['access_token']]);
$list = http_request('GET', 'https://www.donationalerts.com/api/v1/alerts/donations', ['Authorization' => 'Bearer ' . $t['access_token']]);
$last = 0;
foreach ($list['json']['data'] ?? [] as $d) $last = max($last, (int)$d['id']);
db_update('users', ['da_access' => $t['access_token'], 'da_refresh' => $t['refresh_token'] ?? '', 'da_expires' => now() + (int)($t['expires_in'] ?? 3600),
    'da_last_id' => $last, 'da_name' => $me['json']['data']['name'] ?? ''], 'id = ?', [$u['id']]);
redirect('/settings.html?da=connected#platforms');
