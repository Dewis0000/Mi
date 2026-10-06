<?php
// Единая точка инициализации: сессия, конфиг, контент, библиотеки.

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0'); // не показываем ошибки посетителям

date_default_timezone_set('Asia/Yakutsk'); // Нерюнгри

$ROOT = dirname(__DIR__);

require $ROOT . '/lib/helpers.php';
require $ROOT . '/lib/db.php';
require $ROOT . '/lib/notify.php';

// Конфиг с секретами (создаётся на сервере из config.example.php)
$configPath = $ROOT . '/config.php';
if (!is_file($configPath)) {
    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><title>Настройка</title>'
       . '<div style="font-family:sans-serif;max-width:640px;margin:10vh auto;padding:0 20px;color:#333">'
       . '<h1>Сайт почти готов</h1><p>Не найден файл <code>config.php</code>. '
       . 'Скопируйте <code>config.example.php</code> в <code>config.php</code> и заполните настройки.</p></div>';
    exit;
}
/** @var array $config */
$config  = require $configPath;
/** @var array $content */
$content = require $ROOT . '/content.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
    session_start();
}
