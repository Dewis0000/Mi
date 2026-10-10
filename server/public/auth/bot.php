<?php
// Подключение аккаунта бота к приложению StreOps. Только для администратора.
require __DIR__ . '/../_app.php';
session_boot();
$u = current_user();
if (!is_admin($u)) { http_response_code(403); exit('Только для администратора'); }
$state = rand_token();
$_SESSION['oauth'] = ['state' => $state, 'kind' => 'bot', 'next' => '/admin.html'];
redirect(tw_auth_url(TW_BOT_SCOPES, $state, true));
