<?php
// Настройки и опции из БД (редактируются в админке).

const SETTING_DEFAULTS = [
    'base_price' => 3500, 'base_players' => 5, 'extra_per_player' => 700,
    'max_per_game' => 7, 'prepay_amount' => 500, 'cancel_hours' => 24, 'duration_min' => 60,
];

/** Все настройки как массив int-значений (с дефолтами, если таблица пустая). */
function get_settings(array $cfg): array {
    $s = SETTING_DEFAULTS;
    try {
        foreach (db($cfg)->query('SELECT k, v FROM settings') as $row) {
            if (array_key_exists($row['k'], $s)) $s[$row['k']] = (int)$row['v'];
        }
    } catch (Throwable $ex) { error_log('[nery] get_settings ' . $ex->getMessage()); }
    return $s;
}

/** Сохранить настройки (переносимый upsert). $vals: [key => intval]. */
function save_settings(array $cfg, array $vals): void {
    $pdo = db($cfg);
    foreach ($vals as $k => $v) {
        if (!array_key_exists($k, SETTING_DEFAULTS)) continue;
        $u = $pdo->prepare('UPDATE settings SET v = ? WHERE k = ?');
        $u->execute([(string)(int)$v, $k]);
        if ($u->rowCount() === 0) {
            $pdo->prepare('INSERT INTO settings (k, v) VALUES (?, ?)')->execute([$k, (string)(int)$v]);
        }
    }
}

/** Активные опции (для клиента). */
function get_active_options(array $cfg): array {
    try {
        $st = db($cfg)->query('SELECT id, label, price, unit FROM options WHERE active = 1 ORDER BY sort, id');
        return $st->fetchAll();
    } catch (Throwable $ex) { error_log('[nery] options ' . $ex->getMessage()); return []; }
}

/** Все опции (для админки). */
function get_all_options(array $cfg): array {
    try {
        return db($cfg)->query('SELECT id, label, price, unit, sort, active FROM options ORDER BY sort, id')->fetchAll();
    } catch (Throwable $ex) { error_log('[nery] options ' . $ex->getMessage()); return []; }
}
