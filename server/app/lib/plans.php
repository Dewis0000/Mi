<?php
// Тарифы и лимиты. Цены — из макета тарифов; лимиты бесплатного уровня — предложение, легко поменять здесь.

const PLANS = [
    'free' => ['name' => 'Бесплатный', 'price' => 0, 'commands' => 10, 'widgets' => 2, 'music' => false, 'giveaways' => true, 'history_days' => 3],
    'advanced' => ['name' => 'Продвинутая', 'price' => 299, 'commands' => 30, 'widgets' => 3, 'music' => false, 'giveaways' => true, 'history_days' => 7],
    'pro' => ['name' => 'Про', 'price' => 499, 'commands' => 1000, 'widgets' => 10, 'music' => true, 'giveaways' => true, 'history_days' => 90],
    'max' => ['name' => 'Максимум', 'price' => 967, 'commands' => 1000, 'widgets' => 100, 'music' => true, 'giveaways' => true, 'history_days' => 3650],
];

// Цена платного тарифа: по умолчанию из PLANS, а администратор может поменять её в разделе «Тарифы» (хранится в kv).
// Бесплатный тариф всегда стоит 0. Новая цена действует только для новых оплат: уже совершённые платежи хранят свою сумму.
function plan_price(string $key): int {
    if (!isset(PLANS[$key])) return 0;
    if ((int)PLANS[$key]['price'] <= 0) return 0;
    $over = kv_get('plan_prices');
    return is_array($over) && isset($over[$key]) ? (int)$over[$key] : (int)PLANS[$key]['price'];
}

// Тарифы для сайта и админки: лимиты из PLANS, цена — актуальная
function plan_list(): array {
    $out = [];
    foreach (PLANS as $key => $p) {
        $out[] = ['key' => $key, 'price' => plan_price($key), 'defaultPrice' => (int)$p['price']] + $p;
    }
    return $out;
}

function plan_of(array $user): string {
    $p = $user['plan'] ?? 'free';
    if ($p !== 'free' && (int)$user['plan_until'] > 0 && (int)$user['plan_until'] < now()) return 'free';
    return isset(PLANS[$p]) ? $p : 'free';
}

function plan_limits(array $user): array {
    $key = plan_of($user);
    return ['key' => $key] + PLANS[$key];
}

function add_transaction(int $userId, int $amount, string $kind, string $comment, ?string $admin = null): void {
    db_insert('transactions', [
        'user_id' => $userId, 'amount' => $amount, 'kind' => $kind, 'comment' => $comment,
        'admin_login' => $admin, 'created_at' => now(),
    ]);
}

// Включает тариф на $days дней. Если тариф тот же и ещё действует, срок продлевается от его конца.
function plan_activate(int $uid, string $plan, int $days, string $comment, string $kind, int $amount): void {
    $u = db_one('SELECT * FROM users WHERE id = ?', [$uid]);
    $base = plan_of($u) === $plan && (int)$u['plan_until'] > now() ? (int)$u['plan_until'] : now();
    db_update('users', ['plan' => $plan, 'plan_until' => $base + $days * 86400], 'id = ?', [$uid]);
    add_transaction($uid, $amount, $kind, $comment);
}
