<?php
// Вспомогательные функции: экранирование, CSRF, валидация, расчёт цены.

function e(?string $s): string {
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function csrf_token(): string {
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_check(?string $token): bool {
    return !empty($_SESSION['csrf']) && is_string($token) && hash_equals($_SESSION['csrf'], $token);
}

/** Нормализация российского номера к виду +7XXXXXXXXXX. Возвращает null, если не похоже на телефон. */
function normalize_phone(string $raw): ?string {
    $digits = preg_replace('/\D+/', '', $raw);
    if ($digits === '') return null;
    if (strlen($digits) === 11 && ($digits[0] === '8' || $digits[0] === '7')) {
        $digits = '7' . substr($digits, 1);
    } elseif (strlen($digits) === 10) {
        $digits = '7' . $digits;
    }
    if (strlen($digits) !== 11 || $digits[0] !== '7') return null;
    return '+' . $digits;
}

/** Расчёт ориентировочной стоимости по данным заявки и контенту. */
function estimate_price(array $c, array $in): int {
    $q = $c['quest'];
    $players = max($q['players_min'], min($q['players_max'], (int)($in['players'] ?? $q['players_min'])));
    $total = (int)$q['price_base'];
    if ($players > $q['players_base']) {
        $total += ($players - $q['players_base']) * (int)$q['price_extra'];
    }
    if (!empty($in['rest_room'])) {
        $hours = max(1, (int)($in['rest_hours'] ?? 1));
        $total += $hours * (int)$c['restroom']['price_per_hour'];
    }
    foreach ($c['decorations'] as $d) {
        if (!empty($in['deco'][$d['key']])) {
            $total += (int)$d['price'];
        }
    }
    return $total;
}

function rub(int $n): string {
    return number_format($n, 0, ',', ' ') . ' ₽';
}

/** Безопасный редирект в пределах сайта. */
function redirect(string $path): void {
    header('Location: ' . $path);
    exit;
}

function client_ip(): string {
    return substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 45);
}
