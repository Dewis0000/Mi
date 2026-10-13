<?php
// Счётчики стрима: смерти, победы, что угодно. Каждый счётчик — своя команда в чате, свои права и (по желанию)
// автоматический подсчёт из CS2 через Game State Integration. Значения лежат в таблице counters (name = id счётчика).

const COUNTER_SOURCES = [
    'manual' => 'Вручную, командой в чате',
    'cs_kills' => 'Убийства в CS2 (сумма по всем матчам)',
    'cs_deaths' => 'Смерти в CS2 (сумма по всем матчам)',
    'cs_mvp' => 'MVP-раунды в CS2 (сумма по всем матчам)',
];
const COUNTER_ACCESS = ['mods', 'vip', 'subs', 'followers', 'list', 'all'];
const COUNTER_MAX = 10;

// Список счётчиков. Пока настроек нет, есть один счётчик «Смерти» — как раньше, с командой из виджета.
function counters_defs(array $user): array {
    $list = settings_get((int)$user['id'], 'counters', null);
    if (is_array($list)) return array_values($list);
    $w = widget_cfg($user, 'deaths')['content'] ?? [];
    return [[
        'id' => 'deaths',
        'name' => (string)($w['label'] ?? 'Смерти'),
        'command' => mb_strtolower((string)($w['command'] ?? '!смерть')),
        'step' => 1,
        'access' => 'mods',
        'allowList' => '',
        'source' => 'manual',
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

// Проверка и приведение полей из панели. $id — пусто для нового счётчика.
function counter_clean(array $in, string $id, array $list): array {
    $name = trim(mb_substr((string)($in['name'] ?? ''), 0, 40));
    if ($name === '') fail('Назови счётчик, например «Смерти»');
    $cmd = '!' . ltrim(mb_strtolower(preg_replace('/\s+/u', '', (string)($in['command'] ?? ''))), '!');
    if (mb_strlen($cmd) < 2 || mb_strlen($cmd) > 31) fail('Команда от 1 до 30 символов, например !смерть');
    foreach ($list as $o) {
        if ($o['command'] === $cmd && $o['id'] !== $id) fail('Команда ' . $cmd . ' уже занята другим счётчиком');
    }
    $access = in_array($in['access'] ?? '', COUNTER_ACCESS, true) ? $in['access'] : 'mods';
    $source = array_key_exists($in['source'] ?? '', COUNTER_SOURCES) ? $in['source'] : 'manual';
    return [
        'id' => $id !== '' ? $id : 'c' . bin2hex(random_bytes(4)),
        'name' => $name,
        'command' => $cmd,
        'step' => max(1, min(100, (int)($in['step'] ?? 1))),
        'access' => $access,
        'allowList' => mb_substr(trim((string)($in['allowList'] ?? '')), 0, 1000),
        'source' => $source,
    ];
}

// Строка для панели и API: настройки счётчика плюс текущее значение.
function counter_public(int $uid, array $c): array {
    return $c + ['value' => counter_value($uid, (string)$c['id'])];
}

// Игровой подсчёт CS2. Сохраняем последнее значение статистики, а разницу прибавляем к счётчику.
// Если значение стало меньше прежнего — начался новый матч, и в счётчик идёт всё текущее значение.
function counters_gsi_sync(array $user, array $stats): void {
    $uid = (int)$user['id'];
    $keys = ['cs_kills' => 'kills', 'cs_deaths' => 'deaths', 'cs_mvp' => 'mvps'];
    foreach (counters_defs($user) as $c) {
        if (!isset($keys[$c['source']]) || !isset($stats[$keys[$c['source']]])) continue;
        $now = (int)$stats[$keys[$c['source']]];
        $ck = 'cgsi:' . $uid . ':' . $c['id'];
        $prev = kv_get($ck);
        kv_set($ck, $now, 0);
        if ($prev === null) continue; // первый запрос — только запоминаем точку отсчёта
        $delta = $now >= (int)$prev ? $now - (int)$prev : $now;
        if ($delta > 0) counter_store($uid, (string)$c['id'], counter_value($uid, (string)$c['id']) + $delta);
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
