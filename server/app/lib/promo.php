<?php
// Промокоды: скидка на тариф (percent от 1 до 99) или бесплатный тариф (percent 100 — включается сразу, без оплаты).
// Код привязан к одному тарифу. Один пользователь использует код один раз. Использование засчитывается
// только после подтверждённой оплаты (или сразу для бесплатного кода).

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

// Цена тарифа со скидкой промокода, в рублях.
function promo_price(array $p): int {
    return (int)round(PLANS[$p['plan']]['price'] * (100 - (int)$p['percent']) / 100);
}

// Атомарно занимаем использование кода: вставка в promo_uses не пройдёт дважды (PRIMARY KEY),
// а UPDATE проверяет лимит прямо в запросе. Возвращает false, если код уже занят этим пользователем или закончился.
function promo_claim(array $p, int $uid): bool {
    try {
        db_insert('promo_uses', ['code_id' => (int)$p['id'], 'user_id' => $uid, 'created_at' => now()]);
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

// Отмечаем использование. Повторно засчитать тот же код тому же пользователю нельзя: PRIMARY KEY не даст.
function promo_mark_used(array $p, int $uid): void {
    try {
        db_insert('promo_uses', ['code_id' => (int)$p['id'], 'user_id' => $uid, 'created_at' => now()]);
    } catch (Throwable $e) {
        return;
    }
    db_exec('UPDATE promo_codes SET used = used + 1 WHERE id = ?', [$p['id']]);
}
