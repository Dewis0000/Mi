<?php
// Инициализация: сессия, конфиг, контент, библиотеки.

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');
date_default_timezone_set('Asia/Yakutsk');

$ROOT = dirname(__DIR__);
require $ROOT . '/lib/helpers.php';
require $ROOT . '/lib/db.php';
require $ROOT . '/lib/settings.php';
require $ROOT . '/lib/pricing.php';
require $ROOT . '/lib/notify.php';
require $ROOT . '/lib/verify.php';

$configPath = $ROOT . '/config.php';
if (!is_file($configPath)) {
    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><title>Настройка</title>'
       . '<div style="font-family:sans-serif;max-width:640px;margin:10vh auto;padding:0 20px;color:#333">'
       . '<h1>Сайт почти готов</h1><p>Создайте <code>config.php</code> из <code>config.example.php</code> и заполните настройки.</p></div>';
    exit;
}
/** @var array $config */
$config = require $configPath;
/** @var array $content */
$content = require $ROOT . '/content.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => true]);
    session_start();
}
