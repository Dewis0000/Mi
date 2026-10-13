<?php
// ЮKassa: онлайн-пополнение баланса. Деньги зачисляются только после того, как сервер сам запросил статус платежа
// у ЮKassa и получил «succeeded». Тело уведомления от ЮKassa только подсказывает, какой платёж проверить.

const YK_MIN = 100;
const YK_MAX = 50000;

function yk_enabled(): bool {
    return (string)cfg('YOOKASSA_SHOP_ID') !== '' && (string)cfg('YOOKASSA_SECRET_KEY') !== '';
}

// Запрос к API ЮKassa: HTTP Basic (ID магазина и секретный ключ), для создания платежа — ключ идемпотентности.
function yk_call(string $method, string $path, ?array $body = null, ?string $idem = null): array {
    $headers = [
        'Authorization' => 'Basic ' . base64_encode((string)cfg('YOOKASSA_SHOP_ID') . ':' . (string)cfg('YOOKASSA_SECRET_KEY')),
        'Content-Type' => 'application/json',
    ];
    if ($idem !== null) $headers['Idempotence-Key'] = $idem;
    return http_request($method, 'https://api.yookassa.ru/v3' . $path, $headers, $body, 15);
}

// Создаём платёж в ЮKassa и возвращаем ссылку на страницу оплаты.
function yk_create(array $user, int $rub, string $returnUrl): string {
    if (!yk_enabled()) fail('Онлайн-оплата пока не подключена. Напиши администратору StreOps — он зачислит баланс');
    if ($rub < YK_MIN || $rub > YK_MAX) fail('Сумма пополнения — от ' . YK_MIN . ' до ' . YK_MAX . ' ₽');
    $local = db_insert('payments', ['user_id' => (int)$user['id'], 'amount' => $rub, 'status' => 'creating', 'created_at' => now()]);
    $r = yk_call('POST', '/payments', [
        'amount' => ['value' => number_format($rub, 2, '.', ''), 'currency' => 'RUB'],
        'capture' => true,
        'confirmation' => ['type' => 'redirect', 'return_url' => $returnUrl],
        'description' => mb_substr('Пополнение баланса StreOps #' . $local, 0, 128),
        'metadata' => ['local_id' => (string)$local],
    ], 'streops-pay-' . $local); // повторный запрос с тем же ключом не создаст второй платёж
    $ykId = (string)($r['json']['id'] ?? '');
    $url = (string)($r['json']['confirmation']['confirmation_url'] ?? '');
    if ($r['code'] !== 200 || $ykId === '' || $url === '') {
        db_exec("UPDATE payments SET status = 'error' WHERE id = ?", [$local]);
        logline('yookassa', 'create failed: ' . $r['code'] . ' ' . substr((string)($r['raw'] ?? ''), 0, 300));
        fail('ЮKassa не создала платёж (код ' . $r['code'] . '). Попробуй позже');
    }
    db_exec("UPDATE payments SET yk_id = ?, status = 'pending' WHERE id = ?", [$ykId, $local]);
    return $url;
}

// Проверяем платёж у ЮKassa. Зачисляем ровно один раз: UPDATE с условием credited = 0 защищает от двойного зачисления.
function yk_settle(array $p): string {
    if ((string)$p['yk_id'] === '') return (string)$p['status'];
    $r = yk_call('GET', '/payments/' . rawurlencode((string)$p['yk_id']));
    if ($r['code'] !== 200) return 'pending';
    $st = (string)($r['json']['status'] ?? '');
    $amount = (int)round((float)($r['json']['amount']['value'] ?? 0));
    if ($st === 'succeeded' && !empty($r['json']['paid']) && $amount === (int)$p['amount']) {
        $n = db_exec("UPDATE payments SET status = 'succeeded', credited = 1 WHERE id = ? AND credited = 0", [$p['id']]);
        if ($n) {
            db_exec('UPDATE users SET balance = balance + ? WHERE id = ?', [$amount, $p['user_id']]);
            add_transaction((int)$p['user_id'], $amount, 'topup', 'Пополнение через ЮKassa');
        }
        return 'succeeded';
    }
    if ($st === 'canceled') {
        db_exec("UPDATE payments SET status = 'canceled' WHERE id = ? AND credited = 0", [$p['id']]);
        return 'canceled';
    }
    return $st !== '' ? $st : 'pending';
}
