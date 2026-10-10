<?php
// Сессии и права: вход только через Twitch, админ — проверенный Twitch-логин из ADMIN_LOGIN.

function session_boot(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $secure = str_starts_with(base_url(), 'https://');
    session_name('streops_sid');
    session_set_cookie_params(['lifetime' => 60 * 60 * 24 * 30, 'path' => '/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax']);
    ini_set('session.gc_maxlifetime', (string)(60 * 60 * 24 * 30));
    $dir = APP_DIR . '/sessions';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    if (is_writable($dir)) session_save_path($dir);
    session_start();
}

function current_user(): ?array {
    static $cache = false;
    if ($cache !== false) return $cache;
    session_boot();
    $id = $_SESSION['uid'] ?? null;
    $cache = $id ? db_one('SELECT * FROM users WHERE id = ?', [$id]) : null;
    return $cache;
}

function admin_login(): string { return strtolower((string)cfg('ADMIN_LOGIN', 'zaka_00')); }

// Админ — аккаунт Twitch с ником ADMIN_LOGIN. При первом входе запоминаем его Twitch ID:
// если ник когда-нибудь займёт другой человек, доступа он не получит.
function is_admin(?array $u): bool {
    if ($u === null || strtolower((string)$u['login']) !== admin_login()) return false;
    $pinned = kv_get('admin_twitch_id');
    if ($pinned === null) { kv_set('admin_twitch_id', (string)$u['twitch_id']); return true; }
    return (string)$pinned === (string)$u['twitch_id'];
}

function require_user(): array {
    $u = current_user();
    if (!$u) fail('Нужно войти через Twitch', 401);
    if ((int)$u['banned'] && !is_admin($u)) fail('Аккаунт заблокирован администрацией', 403);
    return $u;
}

function require_admin(): array {
    $u = require_user();
    if (!is_admin($u)) fail('Нет доступа', 403);
    return $u;
}

// Защита от подделки запросов: изменяющие запросы принимаем только со своего сайта.
function require_same_origin(): void {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') return;
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $host = parse_url(base_url(), PHP_URL_HOST);
    $reqHost = $_SERVER['HTTP_HOST'] ?? '';
    if ($origin !== '') {
        $oh = parse_url($origin, PHP_URL_HOST);
        if ($oh !== $host && $oh !== preg_replace('/:\d+$/', '', $reqHost)) fail('Запрос с чужого сайта', 403);
    }
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'StreOps') fail('Неверный запрос', 403);
}

function user_public(array $u): array {
    $lim = plan_limits($u);
    return [
        'id' => (int)$u['id'], 'login' => $u['login'], 'name' => $u['display_name'] ?: $u['login'], 'avatar' => $u['avatar'],
        'plan' => $lim['key'], 'planName' => $lim['name'], 'planUntil' => (int)$u['plan_until'], 'balance' => (int)$u['balance'],
        'limits' => $lim, 'botEnabled' => (bool)$u['bot_enabled'], 'botError' => $u['bot_error'], 'isAdmin' => is_admin($u),
        'widgetToken' => $u['widget_token'], 'daConnected' => (bool)$u['da_access'], 'daName' => $u['da_name'],
        'createdAt' => (int)$u['created_at'],
    ];
}
