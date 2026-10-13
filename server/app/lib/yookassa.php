<?php
// ЮKassa: оплата тарифа. Тариф активируется только после того, как сервер сам запросил статус платежа
// у ЮKassa и получил «succeeded» на нужную сумму. Тело уведомления от ЮKassa только подсказывает, какой платёж проверить.

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

// Создаём платёж. Цена берётся на сервере, а не из запроса. Возвращаем ID локального платежа и confirmation_token.
// Для тарифа $plan — оплата подписки. Для тестового платежа без тарифа $plan пустой: он ничего не меняет на сайте.
function yk_make(int $uid, string $plan, int $price, string $desc): array {
    if (!yk_enabled()) fail('Онлайн-оплата пока не подключена. Напиши администратору StreOps');
    $local = db_insert('payments', ['user_id' => $uid, 'plan' => $plan, 'amount' => $price, 'status' => 'creating', 'created_at' => now()]);
    $r = yk_call('POST', '/payments', [
        'amount' => ['value' => number_format($price, 2, '.', ''), 'currency' => 'RUB'],
        'capture' => true,
        'confirmation' => ['type' => 'embedded'],
        'description' => mb_substr($desc . ', заказ #' . $local, 0, 128),
        'metadata' => ['local_id' => (string)$local],
    ], 'streops-pay-' . $local); // повторный запрос с тем же ключом не создаст второй платёж
    $ykId = (string)($r['json']['id'] ?? '');
    $token = (string)($r['json']['confirmation']['confirmation_token'] ?? '');
    if ($r['code'] !== 200 || $ykId === '' || $token === '') {
        db_exec("UPDATE payments SET status = 'error' WHERE id = ?", [$local]);
        logline('yookassa', 'create failed: ' . $r['code'] . ' ' . substr((string)($r['raw'] ?? ''), 0, 300));
        fail('ЮKassa не создала платёж (код ' . $r['code'] . '). Попробуй позже');
    }
    db_exec("UPDATE payments SET yk_id = ?, status = 'pending' WHERE id = ?", [$ykId, $local]);
    return ['id' => $local, 'token' => $token];
}

// Оплата тарифа: цена из PLANS.
function yk_create(array $user, string $plan): array {
    if (!isset(PLANS[$plan]) || PLANS[$plan]['price'] <= 0) fail('Нет такого тарифа для оплаты');
    return yk_make((int)$user['id'], $plan, (int)PLANS[$plan]['price'], 'Тариф «' . PLANS[$plan]['name'] . '» StreOps на 30 дней');
}

// Тестовый платёж для проверки магазина ЮKassa: фиксированная сумма, без входа в аккаунт, тариф не меняется.
function yk_create_demo(): array {
    return yk_make(0, '', 100, 'Тестовый платёж StreOps (проверка приёма оплаты)');
}

// Активация тарифа на 30 дней. Если тариф тот же и ещё действует, срок продлевается от его конца.
function yk_activate(int $uid, string $plan, int $price): void {
    $u = db_one('SELECT * FROM users WHERE id = ?', [$uid]);
    $base = plan_of($u) === $plan && (int)$u['plan_until'] > now() ? (int)$u['plan_until'] : now();
    db_update('users', ['plan' => $plan, 'plan_until' => $base + 30 * 86400], 'id = ?', [$uid]);
    add_transaction($uid, $price, 'plan', 'Оплата тарифа «' . PLANS[$plan]['name'] . '» через ЮKassa на 30 дней');
}

// Проверяем платёж у ЮKassa. Активируем ровно один раз: UPDATE с условием credited = 0 защищает от двойной активации.
function yk_settle(array $p): string {
    if ((string)$p['yk_id'] === '') return (string)$p['status'];
    $r = yk_call('GET', '/payments/' . rawurlencode((string)$p['yk_id']));
    if ($r['code'] !== 200) return 'pending';
    $st = (string)($r['json']['status'] ?? '');
    $amount = (int)round((float)($r['json']['amount']['value'] ?? 0));
    $plan = (string)($p['plan'] ?? '');
    if ($st === 'succeeded' && !empty($r['json']['paid']) && isset(PLANS[$plan]) && $amount === (int)PLANS[$plan]['price']) {
        $n = db_exec("UPDATE payments SET status = 'succeeded', credited = 1 WHERE id = ? AND credited = 0", [$p['id']]);
        if ($n) yk_activate((int)$p['user_id'], $plan, $amount);
        return 'succeeded';
    }
    if ($st === 'canceled') {
        db_exec("UPDATE payments SET status = 'canceled' WHERE id = ? AND credited = 0", [$p['id']]);
        return 'canceled';
    }
    return $st !== '' ? $st : 'pending';
}
