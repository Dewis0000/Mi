<?php
// Фронт-контроллер API. Apache направляет сюда всё /api/* (см. .htaccess).
// Этап 1: публичные эндпойнты (контент, квесты). Дальше добавим авторизацию, брони, бота.

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');
date_default_timezone_set('Asia/Yakutsk');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(int $code, string $error, ?string $ecode = null): void {
    out(['error' => $error, 'code' => $ecode], $code);
}

$data = require __DIR__ . '/content.php';

// путь после /api
$uri  = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$path = preg_replace('#^/api#', '', $uri);
$path = '/' . trim($path, '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// GET /content
if ($method === 'GET' && $path === '/content') {
    out($data['content']);
}

// GET /quests  — без служебных полей (_schedule и т.п.)
$publicQuest = function (array $q): array {
    unset($q['_schedule']);
    return $q;
};

if ($method === 'GET' && $path === '/quests') {
    out(array_map($publicQuest, $data['quests']));
}

// GET /quests/:slug
if ($method === 'GET' && preg_match('#^/quests/([^/]+)$#', $path, $m)) {
    foreach ($data['quests'] as $q) {
        if ($q['slug'] === $m[1] || $q['id'] === $m[1]) out($publicQuest($q));
    }
    fail(404, 'Квест не найден', 'NOT_FOUND');
}

fail(404, 'Не найдено', 'NOT_FOUND');
