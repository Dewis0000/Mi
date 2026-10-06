<?php
// Подключение к БД через PDO. По умолчанию MySQL (прод). 'sqlite' — для локальных тестов.

function db(array $cfg): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $d = $cfg['db'];
    $opts = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    if (($d['driver'] ?? 'mysql') === 'sqlite') {
        $pdo = new PDO('sqlite:' . $d['name'], null, null, $opts);
    } else {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', $d['host'], $d['name'], $d['charset'] ?? 'utf8mb4');
        $pdo = new PDO($dsn, $d['user'], $d['pass'], $opts);
    }
    return $pdo;
}

/** Переносимый UPSERT-инкремент (MySQL + SQLite): прибавить к счётчику или создать строку. */
function upsert_increment(PDO $pdo, string $table, string $keyCol, string $keyVal, string $cntCol, string $tsCol): void {
    $u = $pdo->prepare("UPDATE {$table} SET {$cntCol} = {$cntCol} + 1, {$tsCol} = CURRENT_TIMESTAMP WHERE {$keyCol} = ?");
    $u->execute([$keyVal]);
    if ($u->rowCount() === 0) {
        $pdo->prepare("INSERT INTO {$table} ({$keyCol}, {$cntCol}) VALUES (?, 1)")->execute([$keyVal]);
    }
}
