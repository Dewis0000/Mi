<?php
// Проверка телефона по номеру. Код отправляется в Telegram через Gateway (клиенту
// НЕ нужно первым писать боту). Режимы: off | gateway | mock (показывает код для теста).

function verify_mode(array $cfg): string {
    $m = $cfg['verify']['mode'] ?? 'off';
    return in_array($m, ['off', 'gateway', 'mock'], true) ? $m : 'off';
}

/** Отправить код на телефон. Возврат: ['ok'=>bool, 'error'=>?string, 'debug'=>?code(только mock)]. */
function verify_send(array $cfg, string $phone): array {
    $mode = verify_mode($cfg);
    if ($mode === 'off') return ['ok' => true, 'error' => null, 'debug' => null];

    $code = str_pad((string)random_int(0, 99999), 5, '0', STR_PAD_LEFT);
    $ttl  = max(60, (int)($cfg['verify']['code_ttl'] ?? 300));
    try {
        $pdo = db($cfg);
        $exp = date('Y-m-d H:i:s', time() + $ttl);
        $u = $pdo->prepare('UPDATE verify_codes SET code = ?, expires_at = ?, attempts = 0, created_at = CURRENT_TIMESTAMP WHERE phone = ?');
        $u->execute([$code, $exp, $phone]);
        if ($u->rowCount() === 0)
            $pdo->prepare('INSERT INTO verify_codes (phone, code, expires_at) VALUES (?, ?, ?)')->execute([$phone, $code, $exp]);
    } catch (Throwable $ex) {
        error_log('[nery] verify store ' . $ex->getMessage());
        return ['ok' => false, 'error' => 'Не удалось создать код. Попробуйте позже.', 'debug' => null];
    }

    if ($mode === 'mock') return ['ok' => true, 'error' => null, 'debug' => $code];

    // gateway
    $token = (string)($cfg['verify']['gateway_token'] ?? '');
    if ($token === '') return ['ok' => false, 'error' => 'Проверка телефона не настроена.', 'debug' => null];
    [$httpCode, $resp] = http_post_auth('https://gatewayapi.telegram.org/sendVerificationMessage',
        ['phone_number' => $phone, 'code' => $code, 'ttl' => $ttl], $token);
    $j = json_decode($resp, true);
    if ($httpCode === 200 && !empty($j['ok'])) return ['ok' => true, 'error' => null, 'debug' => null];
    error_log("[nery] gateway http={$httpCode} " . substr($resp, 0, 200));
    return ['ok' => false, 'error' => 'Не удалось отправить код на этот номер.', 'debug' => null];
}

/** Проверить код. true → телефон подтверждён (запоминаем в сессии). */
function verify_check(array $cfg, string $phone, string $input): bool {
    if (verify_mode($cfg) === 'off') { $_SESSION['verified_phone'] = $phone; return true; }
    $input = preg_replace('/\D+/', '', $input);
    try {
        $pdo = db($cfg);
        $st = $pdo->prepare('SELECT code, expires_at, attempts FROM verify_codes WHERE phone = ?');
        $st->execute([$phone]);
        $row = $st->fetch();
        if (!$row) return false;
        if ($row['attempts'] >= 5) return false;
        $pdo->prepare('UPDATE verify_codes SET attempts = attempts + 1 WHERE phone = ?')->execute([$phone]);
        if (strtotime($row['expires_at']) < strtotime(db_now($pdo))) return false;
        if (!hash_equals((string)$row['code'], (string)$input)) return false;
        $pdo->prepare('DELETE FROM verify_codes WHERE phone = ?')->execute([$phone]);
        $_SESSION['verified_phone'] = $phone;
        return true;
    } catch (Throwable $ex) { error_log('[nery] verify check ' . $ex->getMessage()); return false; }
}

function phone_is_verified(array $cfg, string $phone): bool {
    if (verify_mode($cfg) === 'off') return true;
    return ($_SESSION['verified_phone'] ?? null) === $phone;
}
