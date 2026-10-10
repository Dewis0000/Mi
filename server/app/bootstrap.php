<?php
// StreOps backend bootstrap: конфиг из .env, база, сессия, общие функции.
declare(strict_types=1);

define('APP_DIR', __DIR__);
date_default_timezone_set('Europe/Moscow');

function env_load(string $file): void {
    if (!is_file($file)) return;
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
        [$k, $v] = array_map('trim', explode('=', $line, 2));
        if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && $v[-1] === $v[0]) $v = substr($v, 1, -1);
        if (getenv($k) === false) { putenv("$k=$v"); $_ENV[$k] = $v; }
    }
}
env_load(APP_DIR . '/.env');

function cfg(string $key, ?string $default = null): ?string {
    $v = getenv($key);
    return ($v === false || $v === '') ? $default : $v;
}

require APP_DIR . '/lib/db.php';
require APP_DIR . '/lib/http.php';
require APP_DIR . '/lib/plans.php';
require APP_DIR . '/lib/twitch.php';
require APP_DIR . '/lib/auth.php';
require APP_DIR . '/lib/youtube.php';
require APP_DIR . '/lib/donationalerts.php';
require APP_DIR . '/lib/bot.php';

function base_url(): string {
    return rtrim(cfg('APP_URL', 'https://streops.ru'), '/');
}

function now(): int { return time(); }

function json_out($data, int $code = 200): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $code = 400): never {
    json_out(['ok' => false, 'error' => $message], $code);
}

function redirect(string $to): never {
    header('Location: ' . $to);
    exit;
}

function logline(string $channel, string $msg): void {
    $dir = APP_DIR . '/logs';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    @file_put_contents($dir . '/' . $channel . '-' . date('Y-m-d') . '.log', date('H:i:s') . ' ' . $msg . "\n", FILE_APPEND);
}

function settings_get(int $userId, string $key, $default = null) {
    $row = db_one('SELECT value FROM settings WHERE user_id = ? AND skey = ?', [$userId, $key]);
    if (!$row) return $default;
    $v = json_decode((string)$row['value'], true);
    return $v === null ? $default : $v;
}

function settings_set(int $userId, string $key, $value): void {
    $json = json_encode($value, JSON_UNESCAPED_UNICODE);
    if (db_one('SELECT 1 FROM settings WHERE user_id = ? AND skey = ?', [$userId, $key])) {
        db_exec('UPDATE settings SET value = ? WHERE user_id = ? AND skey = ?', [$json, $userId, $key]);
    } else {
        db_exec('INSERT INTO settings (user_id, skey, value) VALUES (?, ?, ?)', [$userId, $key, $json]);
    }
}

function kv_get(string $k) {
    $row = db_one('SELECT v, expires FROM kv WHERE k = ?', [$k]);
    if (!$row) return null;
    if ((int)$row['expires'] && (int)$row['expires'] < now()) return null;
    return json_decode((string)$row['v'], true);
}

function kv_set(string $k, $v, int $ttl = 0): void {
    $json = json_encode($v, JSON_UNESCAPED_UNICODE);
    $exp = $ttl ? now() + $ttl : 0;
    if (db_one('SELECT 1 FROM kv WHERE k = ?', [$k])) db_exec('UPDATE kv SET v = ?, expires = ? WHERE k = ?', [$json, $exp, $k]);
    else db_exec('INSERT INTO kv (k, v, expires) VALUES (?, ?, ?)', [$k, $json, $exp]);
}

function rand_token(int $bytes = 16): string { return bin2hex(random_bytes($bytes)); }

function fmt_duration(int $sec, bool $words = true): string {
    $h = intdiv($sec, 3600); $m = intdiv($sec % 3600, 60); $s = $sec % 60;
    if (!$words) return sprintf('%02d:%02d:%02d', $h, $m, $s);
    if ($h > 0) return $h . ' ч ' . $m . ' мин';
    return $m . ' мин';
}
