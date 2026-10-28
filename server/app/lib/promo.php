<?php
// Промокоды: скидка (percent от 1 до 99) или бесплатный тариф (percent 100 — включается сразу, без оплаты).
// Код привязан к одному платному тарифу или ко всем платным сразу (PROMO_ANY). Один пользователь использует код один раз.
// Использование засчитывается только после подтверждённой оплаты (или сразу для бесплатного кода).
// Код можно выдать партнёру (поле partner): в админке видно, кто его применил, какой тариф купил и сколько принёс денег.

const PROMO_ANY = 'any';

function promo_norm(string $code): string {
    return mb_strtoupper((string)preg_replace('/\s+/u', '', $code));
}

// Проверяем код для пользователя и возвращаем строку промокода. Иначе — понятная ошибка.
function promo_check(array $user, string $code): array {
    $c = promo_norm($code);
    if ($c === '') fail('Введи промокод');
    $p = db_one('SELECT * FROM promo_codes WHERE code = ?', [$c]);
    if (!$p || !(int)$p['active']) fail('Такого промокода нет или он выключен');
    if ((int)$p['expires_at'] > 0 && (int)$p['expires_at'] < now()) fail('Срок действия промокода истёк');
    if ((int)$p['max_uses'] > 0 && (int)$p['used'] >= (int)$p['max_uses']) fail('Промокод уже использован максимальное число раз');
    if (db_one('SELECT 1 AS x FROM promo_uses WHERE code_id = ? AND user_id = ?', [$p['id'], $user['id']])) fail('Ты уже использовал этот промокод');
    return $p;
}

// Подходит ли код к выбранному тарифу: либо тариф указан в коде, либо код «на любой платный тариф»
function promo_plan_ok(array $p, string $plan): bool {
    if ((int)plan_price($plan) <= 0) return false; // бесплатный тариф промокодом не покупается
    return $p['plan'] === PROMO_ANY ? true : $p['plan'] === $plan;
}

// Цена выбранного тарифа со скидкой промокода, в рублях.
function promo_price(array $p, string $plan): int {
    return (int)round(plan_price($plan) * (100 - (int)$p['percent']) / 100);
}

// Атомарно занимаем использование кода: вставка в promo_uses не пройдёт дважды (PRIMARY KEY),
// а UPDATE проверяет лимит прямо в запросе. Возвращает false, если код уже занят этим пользователем или закончился.
function promo_claim(array $p, int $uid, string $plan): bool {
    try {
        db_insert('promo_uses', ['code_id' => (int)$p['id'], 'user_id' => $uid, 'created_at' => now(), 'plan' => $plan, 'amount' => 0]);
    } catch (Throwable $e) {
        return false;
    }
    if (db_exec('UPDATE promo_codes SET used = used + 1 WHERE id = ? AND (max_uses = 0 OR used < max_uses)', [(int)$p['id']]) < 1) {
        db_exec('DELETE FROM promo_uses WHERE code_id = ? AND user_id = ?', [(int)$p['id'], $uid]);
        return false;
    }
    return true;
}

// Возвращаем занятое использование, если тариф не включился
function promo_release(array $p, int $uid): void {
    db_exec('DELETE FROM promo_uses WHERE code_id = ? AND user_id = ?', [(int)$p['id'], $uid]);
    db_exec('UPDATE promo_codes SET used = used - 1 WHERE id = ? AND used > 0', [(int)$p['id']]);
}

// Отмечаем использование после оплаты: тариф, сумма и время. Повторно засчитать тот же код тому же пользователю нельзя.
function promo_mark_used(array $p, int $uid, string $plan, int $amount): void {
    try {
        db_insert('promo_uses', ['code_id' => (int)$p['id'], 'user_id' => $uid, 'created_at' => now(), 'plan' => $plan, 'amount' => $amount]);
    } catch (Throwable $e) {
        return;
    }
    db_exec('UPDATE promo_codes SET used = used + 1 WHERE id = ?', [$p['id']]);
}

// Сколько людей применили код (бесплатно или через оплату, в том числе незавершённую)
function promo_applied_count(int $id): int {
    $r = db_one('SELECT COUNT(*) c FROM (SELECT user_id FROM promo_uses WHERE code_id = ? UNION SELECT user_id FROM payments WHERE promo_id = ?) t', [$id, $id]);
    return (int)($r['c'] ?? 0);
}

// Удалить код можно только если по нему ещё не было оплат: иначе история продаж останется без кода
function promo_has_payments(int $id): bool {
    return (bool)db_one('SELECT 1 AS x FROM payments WHERE promo_id = ? LIMIT 1', [$id]);
}

// Код для таблицы в админке
function promo_row(array $r): array {
    return ['id' => (int)$r['id'], 'code' => (string)$r['code'], 'plan' => (string)$r['plan'], 'percent' => (int)$r['percent'], 'days' => (int)$r['days'],
        'maxUses' => (int)$r['max_uses'], 'used' => (int)$r['used'], 'active' => (bool)$r['active'], 'partner' => (string)($r['partner'] ?? ''),
        'expiresAt' => (int)$r['expires_at'], 'createdAt' => (int)$r['created_at']];
}
