<?php
require __DIR__ . '/../_app.php';
session_boot();
$next = (string)($_GET['next'] ?? '/panel.html');
if (!preg_match('~^/[A-Za-z0-9_\-./?=&#]*$~', $next) || str_starts_with($next, '//')) $next = '/panel.html';
// reauth=1: Twitch заново покажет окно с правами — даже если уже вошёл. Так обновляется доступ (например, к баллам канала).
$reauth = !empty($_GET['reauth']);
if (current_user() && !$reauth) redirect($next);
$state = rand_token();
$_SESSION['oauth'] = ['state' => $state, 'kind' => 'login', 'next' => $next];
redirect(tw_auth_url(TW_STREAMER_SCOPES, $state, $reauth));
