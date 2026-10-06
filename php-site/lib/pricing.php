<?php
// Движок расчёта цены. Правила:
//  - 1..base_players игроков → 1 игра = base_price
//  - base_players+1 .. max_per_game → 1 игра = base_price + extra_per_player за каждого сверх базовых
//  - больше max_per_game → делим на игры по base_players человек, каждая игра = base_price
//    (например: до 5 = 3500; 6 = 4200; 7 = 4900; 10 = 2 игры × 3500 = 7000)

/** [games, gamesTotal] для количества игроков. */
function price_players(array $s, int $n): array {
    $n   = max(1, $n);
    $base = max(0, (int)$s['base_price']);
    $bp   = max(1, (int)$s['base_players']);
    $extra = max(0, (int)$s['extra_per_player']);
    $maxg = max($bp, (int)$s['max_per_game']);

    if ($n <= $maxg) {
        return [1, $base + $extra * max(0, $n - $bp)];
    }
    $games = (int)ceil($n / $bp);
    return [$games, $games * $base];
}

/**
 * Полный расчёт брони.
 * $options — активные опции [{id,label,price,unit}]; $sel — [option_id => qty] (часы для 'hour', 1 для 'toggle').
 * Возвращает players, games, gamesTotal, optionsTotal, total, prepay, lines[], split(bool).
 */
function compute_booking(array $s, array $options, int $players, array $sel): array {
    [$games, $gamesTotal] = price_players($s, $players);

    $optionsTotal = 0;
    $lines = [];
    foreach ($options as $o) {
        $qty = (int)($sel[$o['id']] ?? 0);
        if ($qty <= 0) continue;
        if ($o['unit'] === 'hour') {
            $line = (int)$o['price'] * $qty;
            $lines[] = ['id' => (int)$o['id'], 'label' => $o['label'], 'qty' => $qty, 'unit' => 'hour', 'line' => $line];
        } else {
            $line = (int)$o['price'];
            $lines[] = ['id' => (int)$o['id'], 'label' => $o['label'], 'qty' => 1, 'unit' => 'toggle', 'line' => $line];
        }
        $optionsTotal += $line;
    }

    $total  = $gamesTotal + $optionsTotal;
    $prepay = min((int)$s['prepay_amount'], $total);

    return [
        'players' => max(1, $players),
        'games' => $games,
        'split' => $games > 1,
        'gamesTotal' => $gamesTotal,
        'optionsTotal' => $optionsTotal,
        'total' => $total,
        'prepay' => $prepay,
        'lines' => $lines,
    ];
}
