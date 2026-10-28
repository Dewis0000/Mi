<?php
// ЮKassa: оплата тарифа. Тариф активируется только после того, как сервер сам запросил статус платежа
// у ЮKassa и получил «succeeded» на нужную сумму. Тело уведомления от ЮKassa только подсказывает, какой платёж проверить.

function yk_enabled(): bool {
    return (string)cfg('YOOKASSA_SHOP_ID') !== '' && (string)cfg('YOOKASSA_SECRET_KEY') !== '';
}

// Ключи тестового магазина начинаются с test_. Для приёма денег нужны боевые ключи.
function yk_is_test(): bool {
    return str_starts_with((string)cfg('YOOKASSA_SECRET_KEY'), 'test_');
}

// Чек для 54-ФЗ: нужен, если в магазине включена фискализация (YOOKASSA_RECEIPT=1).
// Ставка НДС — YOOKASSA_VAT_CODE, по умолчанию 1 (без НДС).
function yk_receipt(string $email, string $desc, int $price): ?array {
    if ((string)cfg('YOOKASSA_RECEIPT') !== '1') return null;
    if ($email === '') fail('Для оплаты нужен email в профиле: без него ЮKassa не сможет выдать чек');
    return [
        'customer' => ['email' => $email],
        'items' => [[
            'description' => mb_substr($desc, 0, 128),
            'quantity' => '1.00',
            'amount' => ['value' => number_format($price, 2, '.', ''), 'currency' => 'RUB'],
            'vat_code' => (string)(cfg('YOOKASSA_VAT_CODE') ?? '1'),
            'payment_mode' => 'full_payment',
            'payment_subject' => 'service',
        ]],
    ];
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
function yk_make(int $uid, string $plan, int $price, string $desc, int $promoId = 0, string $email = '', int $listPrice = 0): array {
    if (!yk_enabled()) fail('Онлайн-оплата пока не подключена. Напиши администратору StreOps');
    // list_price — цена тарифа без скидки на момент покупки: по ней считаем, сколько денег отдали как скидку
    $local = db_insert('payments', ['user_id' => $uid, 'plan' => $plan, 'promo_id' => $promoId, 'amount' => $price, 'list_price' => $listPrice ?: $price, 'status' => 'creating', 'created_at' => now()]);
    $body = [
        'amount' => ['value' => number_format($price, 2, '.', ''), 'currency' => 'RUB'],
        'capture' => true,
        'confirmation' => ['type' => 'embedded'],
        'description' => mb_substr($desc . ', заказ #' . $local, 0, 128),
        'metadata' => ['local_id' => (string)$local],
    ];
    if ($receipt = yk_receipt($email, $desc, $price)) $body['receipt'] = $receipt;
    $r = yk_call('POST', '/payments', $body, 'streops-pay-' . $local); // повторный запрос с тем же ключом не создаст второй платёж
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

// Оплата тарифа: цена из PLANS, со скидкой промокода, если он передан (промокод уже проверен).
function yk_create(array $user, string $plan, ?array $promo = null): array {
    if (!isset(PLANS[$plan]) || plan_price($plan) <= 0) fail('Нет такого тарифа для оплаты');
    $list = plan_price($plan);
    $price = $promo ? promo_price($promo, $plan) : $list;
    $days = $promo ? (int)$promo['days'] : 30;
    $desc = 'Тариф «' . PLANS[$plan]['name'] . '» StreOps на ' . $days . ' дн.' . ($promo ? ', промокод ' . $promo['code'] : '');
    return yk_make((int)$user['id'], $plan, $price, $desc, $promo ? (int)$promo['id'] : 0, (string)($user['email'] ?? ''), $list);
}

// Тестовый платёж для проверки магазина ЮKassa: фиксированная сумма, без входа в аккаунт, тариф не меняется.
function yk_create_demo(): array {
    if ((string)cfg('YOOKASSA_DEMO') !== '1') fail('Тестовая оплата выключена');
    return yk_make(0, '', 10, 'Тестовый платёж StreOps (проверка приёма оплаты)');
}

// Проверяем платёж у ЮKassa. Активируем ровно один раз: UPDATE с условием credited = 0 защищает от двойной активации.
function yk_settle(array $p): string {
    if ((string)$p['yk_id'] === '') return (string)$p['status'];
    $r = yk_call('GET', '/payments/' . rawurlencode((string)$p['yk_id']));
    if ($r['code'] !== 200) return 'pending';
    $st = (string)($r['json']['status'] ?? '');
    $amount = (int)round((float)($r['json']['amount']['value'] ?? 0));
    $plan = (string)($p['plan'] ?? '');
    // сумма должна совпадать с той, что мы сами записали при создании платежа (с учётом промокода)
    if ($st === 'succeeded' && !empty($r['json']['paid']) && isset(PLANS[$plan]) && $amount > 0 && $amount === (int)$p['amount']) {
        $n = db_exec("UPDATE payments SET status = 'succeeded', credited = 1, paid_at = ? WHERE id = ? AND credited = 0", [now(), $p['id']]);
        if ($n) {
            $promo = (int)($p['promo_id'] ?? 0) > 0 ? db_one('SELECT * FROM promo_codes WHERE id = ?', [$p['promo_id']]) : null;
            $days = $promo ? (int)$promo['days'] : 30;
            plan_activate((int)$p['user_id'], $plan, $days, 'Оплата тарифа «' . PLANS[$plan]['name'] . '» через ЮKassa на ' . $days . ' дн.' . ($promo ? ', промокод ' . $promo['code'] : ''), 'plan', $amount);
            if ($promo) promo_mark_used($promo, (int)$p['user_id'], $plan, $amount);
        }
        return 'succeeded';
    }
    if ($st === 'canceled') {
        db_exec("UPDATE payments SET status = 'canceled' WHERE id = ? AND credited = 0", [$p['id']]);
        return 'canceled';
    }
    return $st !== '' ? $st : 'pending';
}
