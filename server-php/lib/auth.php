<?php
/** Коды подтверждения телефона (выдача, проверка, анти-флуд). */
declare(strict_types=1);

function code_hash(string $phone, string $code): string {
    return hash_hmac('sha256', $phone . '|' . $code, (string)cfg('app_secret'));
}

function issue_code(string $phone, string $purpose): array {
    $pdo = db();
    $since = time() - 600;
    $st = $pdo->prepare('SELECT created_at FROM auth_codes WHERE phone = ? AND created_at > ? ORDER BY created_at DESC');
    $st->execute([$phone, $since]);
    $recent = array_map('intval', array_column($st->fetchAll(), 'created_at'));

    if (count($recent) >= 3) {
        $oldest = end($recent);
        $retryIn = (int)ceil(($oldest + 600 - time()));
        fail(429, 'Слишком много запросов кода. Попробуйте позже.', 'RATE_LIMIT', ['retryIn' => max(1, $retryIn)]);
    }
    if (!empty($recent) && (time() - $recent[0]) < 60) {
        $retryIn = (int)ceil(($recent[0] + 60 - time()));
        fail(429, 'Код уже отправлен. Подождите перед повторной отправкой.', 'RESEND_WAIT', ['retryIn' => max(1, $retryIn)]);
    }

    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $ins = $pdo->prepare('INSERT INTO auth_codes (id, phone, purpose, code_hash, attempts, expires_at, consumed, created_at) VALUES (?,?,?,?,0,?,0,?)');
    $ins->execute([uid(), $phone, $purpose, code_hash($phone, $code), time() + 300, time()]);

    return ['resendIn' => 60, '_code' => $code];
}

/** Выдать код без анти-флуд-проверок (для бота: человек только что поделился номером). */
function mint_code(string $phone, string $purpose): string {
    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    db()->prepare('INSERT INTO auth_codes (id, phone, purpose, code_hash, attempts, expires_at, consumed, created_at) VALUES (?,?,?,?,0,?,0,?)')
        ->execute([uid(), $phone, $purpose, code_hash($phone, $code), time() + 300, time()]);
    return $code;
}

function consume_code(string $phone, $code, string $purpose): void {
    if (!is_string($code) || !preg_match('/^\d{6}$/', $code)) fail(400, 'Код — 6 цифр', 'VALIDATION');
    $pdo = db();
    $st = $pdo->prepare('SELECT * FROM auth_codes WHERE phone = ? AND purpose = ? AND consumed = 0 AND expires_at > ? ORDER BY created_at DESC');
    $st->execute([$phone, $purpose, time()]);
    $rec = $st->fetch();
    if (!$rec) fail(400, 'Код истёк или не запрашивался. Запросите новый.', 'CODE_EXPIRED');
    if ((int)$rec['attempts'] >= 5) fail(400, 'Превышено число попыток. Запросите новый код.', 'CODE_ATTEMPTS');
    if (!hash_equals($rec['code_hash'], code_hash($phone, $code))) {
        $pdo->prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?')->execute([$rec['id']]);
        fail(400, 'Неверный код', 'CODE_INVALID', ['attemptsLeft' => 5 - ((int)$rec['attempts'] + 1)]);
    }
    $pdo->prepare('UPDATE auth_codes SET consumed = 1 WHERE id = ?')->execute([$rec['id']]);
}
