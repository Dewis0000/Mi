<?php
// Утилиты: экранирование, CSRF, телефон, деньги, JSON-ответ.

function e(?string $s): string {
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function csrf_token(): string {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}
function csrf_check(?string $t): bool {
    return !empty($_SESSION['csrf']) && is_string($t) && hash_equals($_SESSION['csrf'], $t);
}

/** Российский номер → +7XXXXXXXXXX, иначе null. */
function normalize_phone(string $raw): ?string {
    $d = preg_replace('/\D+/', '', $raw);
    if ($d === '') return null;
    if (strlen($d) === 11 && ($d[0] === '8' || $d[0] === '7')) $d = '7' . substr($d, 1);
    elseif (strlen($d) === 10) $d = '7' . $d;
    if (strlen($d) !== 11 || $d[0] !== '7') return null;
    return '+' . $d;
}

function rub(int $n): string {
    return number_format($n, 0, ',', ' ') . ' ₽';
}

function redirect(string $path): void { header('Location: ' . $path); exit; }

function client_ip(): string { return substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 45); }

function json_out($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Текущее время БД в формате строки (чтобы сравнивать с created_at без рассинхронизации TZ). */
function db_now(PDO $pdo): string {
    return (string)$pdo->query('SELECT CURRENT_TIMESTAMP')->fetchColumn();
}
