<?php
require __DIR__ . '/../_app.php';
require APP_DIR . '/lib/api.php';
try {
    api_dispatch((string)($_GET['r'] ?? ''));
} catch (Throwable $e) {
    logline('api', ($_GET['r'] ?? '') . ' ' . $e->getMessage() . ' @' . basename($e->getFile()) . ':' . $e->getLine());
    fail('Ошибка сервера. Попробуй ещё раз через минуту.', 500);
}
