<?php
// Тарифы и лимиты. Цены — из макета тарифов; лимиты бесплатного уровня — предложение, легко поменять здесь.

const PLANS = [
    'free' => ['name' => 'Бесплатный', 'price' => 0, 'commands' => 10, 'widgets' => 2, 'music' => false, 'giveaways' => true, 'history_days' => 3],
    'advanced' => ['name' => 'Продвинутая', 'price' => 299, 'commands' => 30, 'widgets' => 3, 'music' => false, 'giveaways' => true, 'history_days' => 7],
    'pro' => ['name' => 'Про', 'price' => 499, 'commands' => 1000, 'widgets' => 10, 'music' => true, 'giveaways' => true, 'history_days' => 90],
    'max' => ['name' => 'Максимум', 'price' => 967, 'commands' => 1000, 'widgets' => 100, 'music' => true, 'giveaways' => true, 'history_days' => 3650],
];

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
