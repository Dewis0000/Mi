<?php
// Деньги: выручка по оплатам тарифов через ЮKassa. Считаются только подтверждённые платежи (статус succeeded),
// тестовые платежи без тарифа не попадают. Скидки — это цена без скидки минус сумма, которую заплатил пользователь.
// Возвратов через панель нет: если деньги вернули в ЮKassa вручную, в отчёте они остаются.

// Сводка за период: число оплат и сумма, рубли. $since — unix time начала периода
function money_period(int $since): array {
    $r = db_one("SELECT COUNT(*) c, COALESCE(SUM(amount), 0) s FROM payments WHERE status = 'succeeded' AND plan <> '' AND paid_at >= ?", [$since]);
    return ['count' => (int)$r['c'], 'sum' => (int)$r['s']];
}

// По дням за последние $days дней (включая сегодня), по возрастанию. Дни считаем по Москве.
function money_daily(int $days): array {
    $start = strtotime('today', now()) - ($days - 1) * 86400;
    $buckets = [];
    for ($i = 0; $i < $days; $i++) {
        $buckets[date('Y-m-d', $start + $i * 86400)] = ['day' => date('Y-m-d', $start + $i * 86400), 'count' => 0, 'sum' => 0];
    }
    foreach (db_all("SELECT amount, paid_at FROM payments WHERE status = 'succeeded' AND plan <> '' AND paid_at >= ?", [$start]) as $r) {
        $k = date('Y-m-d', (int)$r['paid_at']);
        if (!isset($buckets[$k])) continue;
        $buckets[$k]['count']++;
        $buckets[$k]['sum'] += (int)$r['amount'];
    }
    return array_values($buckets);
}

// Полный отчёт для админки
function money_report(): array {
    $t = now();
    $all = db_one("SELECT COUNT(*) c, COALESCE(SUM(amount), 0) s, COALESCE(SUM(list_price - amount), 0) d FROM payments WHERE status = 'succeeded' AND plan <> ''");
    $count = (int)$all['c'];
    $sum = (int)$all['s'];

    // по тарифам: сколько раз купили и сколько принесли
    $byPlan = [];
    foreach (db_all("SELECT plan, COUNT(*) c, COALESCE(SUM(amount), 0) s FROM payments WHERE status = 'succeeded' AND plan <> '' GROUP BY plan") as $r) {
        $byPlan[] = ['plan' => (string)$r['plan'], 'name' => PLANS[$r['plan']]['name'] ?? $r['plan'], 'count' => (int)$r['c'], 'sum' => (int)$r['s']];
    }
    usort($byPlan, fn($a, $b) => $b['sum'] <=> $a['sum']);

    // по промокодам: оплаты, сумма, скидка и бесплатные активации
    $codes = [];
    foreach (db_all("SELECT id, code, partner, plan, percent FROM promo_codes") as $c) {
        $codes[(int)$c['id']] = ['id' => (int)$c['id'], 'code' => (string)$c['code'], 'partner' => (string)$c['partner'], 'plan' => (string)$c['plan'], 'percent' => (int)$c['percent'],
            'count' => 0, 'sum' => 0, 'discount' => 0, 'free' => 0];
    }
    foreach (db_all("SELECT promo_id, COUNT(*) c, COALESCE(SUM(amount), 0) s, COALESCE(SUM(list_price - amount), 0) d FROM payments WHERE status = 'succeeded' AND plan <> '' AND promo_id > 0 GROUP BY promo_id") as $r) {
        $id = (int)$r['promo_id'];
        if (!isset($codes[$id])) $codes[$id] = ['id' => $id, 'code' => '(удалён)', 'partner' => '', 'plan' => '', 'percent' => 0, 'count' => 0, 'sum' => 0, 'discount' => 0, 'free' => 0];
        $codes[$id]['count'] = (int)$r['c'];
        $codes[$id]['sum'] = (int)$r['s'];
        $codes[$id]['discount'] = (int)$r['d'];
    }
    foreach (db_all('SELECT code_id, COUNT(*) c FROM promo_uses WHERE amount = 0 GROUP BY code_id') as $r) {
        $id = (int)$r['code_id'];
        if (isset($codes[$id])) $codes[$id]['free'] = (int)$r['c'];
    }
    $byPromo = array_values(array_filter($codes, fn($c) => $c['count'] > 0 || $c['free'] > 0));
    usort($byPromo, fn($a, $b) => $b['sum'] <=> $a['sum']);

    // по партнёрам: все коды одного партнёра вместе
    $partners = [];
    foreach ($byPromo as $c) {
        $name = $c['partner'] !== '' ? $c['partner'] : 'Без партнёра';
        $partners[$name] ??= ['partner' => $name, 'count' => 0, 'sum' => 0, 'discount' => 0, 'free' => 0];
        $partners[$name]['count'] += $c['count'];
        $partners[$name]['sum'] += $c['sum'];
        $partners[$name]['discount'] += $c['discount'];
        $partners[$name]['free'] += $c['free'];
    }
    $byPartner = array_values($partners);
    usort($byPartner, fn($a, $b) => $b['sum'] <=> $a['sum']);

    // без промокода — для сравнения
    $direct = db_one("SELECT COUNT(*) c, COALESCE(SUM(amount), 0) s FROM payments WHERE status = 'succeeded' AND plan <> '' AND promo_id = 0");

    // воронка: сколько оплат начато и чем закончилось
    $funnel = ['created' => 0, 'succeeded' => 0, 'pending' => 0, 'canceled' => 0, 'error' => 0];
    foreach (db_all("SELECT status, COUNT(*) c FROM payments WHERE plan <> '' GROUP BY status") as $r) {
        $funnel['created'] += (int)$r['c'];
        $st = (string)$r['status'];
        if (isset($funnel[$st])) $funnel[$st] = (int)$r['c'];
    }

    $recent = [];
    foreach (db_all("SELECT p.id, p.plan, p.amount, p.list_price, p.paid_at, p.promo_id, u.login, pc.code FROM payments p JOIN users u ON u.id = p.user_id LEFT JOIN promo_codes pc ON pc.id = p.promo_id WHERE p.status = 'succeeded' AND p.plan <> '' ORDER BY p.paid_at DESC, p.id DESC LIMIT 40") as $r) {
        $recent[] = ['id' => (int)$r['id'], 'login' => (string)$r['login'], 'plan' => (string)$r['plan'], 'planName' => PLANS[$r['plan']]['name'] ?? $r['plan'],
            'amount' => (int)$r['amount'], 'listPrice' => (int)$r['list_price'], 'promo' => $r['code'] ?: null, 'at' => (int)$r['paid_at']];
    }

    return [
        'periods' => [
            'today' => money_period(strtotime('today', $t)),
            'week' => money_period($t - 7 * 86400),
            'month' => money_period($t - 30 * 86400),
        ],
        'all' => ['count' => $count, 'sum' => $sum, 'discount' => (int)$all['d'], 'avgCheck' => $count ? (int)round($sum / $count) : 0],
        'daily' => money_daily(30),
        'byPlan' => $byPlan,
        'byPromo' => $byPromo,
        'byPartner' => $byPartner,
        'direct' => ['count' => (int)$direct['c'], 'sum' => (int)$direct['s']],
        'funnel' => $funnel,
        'recent' => $recent,
    ];
}
