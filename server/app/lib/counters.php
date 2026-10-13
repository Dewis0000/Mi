<?php
// Счётчик виджета «Счётчик»: смерти, матчи, победы, что угодно. Настройки лежат в самом виджете (widgets.cfg.deaths.content),
// значение — в таблице counters (name = 'deaths'). Команда в чате меняет значение, CS2 может считать сам через Game State Integration.

const COUNTER_SOURCES = [
    'manual' => 'Вручную, командой в чате',
    'cs_deaths' => 'Смерти в CS2',
    'cs_kills' => 'Убийства в CS2',
    'cs_mvp' => 'MVP-раунды в CS2',
    'cs_matches' => 'Сыгранные матчи в CS2',
];
const COUNTER_ACCESS = ['mods', 'vip', 'subs', 'followers', 'list', 'all'];

// Настройки счётчика из виджета. До первой настройки — «Смерти» с командой !смерть.
function counters_defs(array $user): array {
    $c = widget_cfg($user, 'deaths')['content'] ?? [];
    $source = array_key_exists($c['source'] ?? '', COUNTER_SOURCES) ? $c['source'] : 'manual';
    $access = in_array($c['access'] ?? '', COUNTER_ACCESS, true) ? $c['access'] : 'mods';
    return [[
        'id' => 'deaths',
        'name' => (string)($c['label'] ?? 'Смертей'),
        'command' => mb_strtolower((string)($c['command'] ?? '!смерть')),
        'step' => max(1, min(100, (int)($c['step'] ?? 1))),
        'access' => $access,
        'allowList' => (string)($c['allowList'] ?? ''),
        'source' => $source,
    ]];
}

function counter_row_value(int $uid, string $id): ?int {
    $row = db_one('SELECT value FROM counters WHERE user_id = ? AND name = ?', [$uid, $id]);
    return $row ? (int)$row['value'] : null;
}

function counter_value(int $uid, string $id): int {
    return counter_row_value($uid, $id) ?? 0;
}

function counter_store(int $uid, string $id, int $val): void {
    db_exec('DELETE FROM counters WHERE user_id = ? AND name = ?', [$uid, $id]);
    db_insert('counters', ['user_id' => $uid, 'name' => $id, 'value' => $val]);
}

// Игровой подсчёт CS2 по GSI. Запоминаем последнее значение источника и прибавляем разницу.
// Статистика стала меньше — новый матч: прибавляем всё текущее значение.
// Матчи: номер раунда сбрасывается в 0 с каждым новым матчем, значит счёт +1 при уменьшении раунда.
function counters_gsi_sync(array $user, array $in): void {
    $uid = (int)$user['id'];
    $stats = is_array($in['player']['match_stats'] ?? null) ? $in['player']['match_stats'] : [];
    $round = $in['map']['round'] ?? null;
    $keys = ['cs_kills' => 'kills', 'cs_deaths' => 'deaths', 'cs_mvp' => 'mvps'];
    foreach (counters_defs($user) as $c) {
        $src = $c['source'];
        $ck = 'cgsi:' . $uid . ':' . $c['id'];
        $prev = kv_get($ck);
        $prev = is_array($prev) && ($prev['s'] ?? null) === $src ? $prev['v'] : null; // источник сменили — точка отсчёта заново
        if ($src === 'cs_matches') {
            if (!is_int($round)) continue;
            kv_set($ck, ['s' => $src, 'v' => $round]);
            if ($prev !== null && $round < (int)$prev) counter_store($uid, 'deaths', counter_value($uid, 'deaths') + 1);
            continue;
        }
        if (!isset($keys[$src]) || !isset($stats[$keys[$src]])) continue;
        $now = (int)$stats[$keys[$src]];
        kv_set($ck, ['s' => $src, 'v' => $now]);
        if ($prev === null) continue; // первый раз — только запоминаем точку отсчёта
        $delta = $now >= (int)$prev ? $now - (int)$prev : $now;
        if ($delta > 0) counter_store($uid, 'deaths', counter_value($uid, 'deaths') + $delta);
    }
}

// Ответ в чат на команду счётчика: меняет тот, у кого есть право, остальные видят значение.
function counter_chat(array $user, array $c, array $ctx, string $arg): void {
    $uid = (int)$user['id'];
    $val = counter_value($uid, (string)$c['id']);
    if (access_ok($user, (string)$c['access'], $ctx['roles'], $ctx['chatterId'], $ctx['login'], (string)$c['allowList'])) {
        if ($arg === '') $val += (int)$c['step'];
        elseif ($arg === '0' || $arg === 'сброс') $val = 0;
        elseif (preg_match('/^[+-]?\d+$/', $arg)) $val += (int)$arg;
        else $arg = null;
        if ($arg !== null) counter_store($uid, (string)$c['id'], $val);
    }
    tw_send($user['twitch_id'], $c['name'] . ': ' . $val, $ctx['msgId']);
}
