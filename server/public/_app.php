<?php
// Где лежит серверная часть: на хостинге — ~/streops-app (вне папки сайта), локально — ../app.
foreach ([dirname(__DIR__, 2) . '/streops-app', dirname(__DIR__) . '/app', __DIR__ . '/../app'] as $dir) {
    if (is_file($dir . '/bootstrap.php')) { require_once $dir . '/bootstrap.php'; return; }
}
http_response_code(500);
exit('StreOps: не найдена папка streops-app');
