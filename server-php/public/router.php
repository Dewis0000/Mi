<?php
// Роутер ТОЛЬКО для локального теста: php -S 127.0.0.1:PORT server-php/public/router.php
// В проде маршрутизацию делает Apache (.htaccess). Эмулирует: /api → фронт-контроллер,
// существующие файлы — статикой, остальное — index.html (SPA).

$root = __DIR__;
$uri  = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/';

if (preg_match('#^/api(/|$)#', $uri)) {
    require $root . '/api/index.php';
    return true;
}

$file = $root . $uri;
if ($uri !== '/' && is_file($file)) {
    return false; // отдать статику как есть
}

require $root . '/index.html';
return true;
