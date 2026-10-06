<?php
// Подключение к MySQL через PDO.

function db(array $cfg): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $d = $cfg['db'];
    $opts = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    // По умолчанию MySQL (прод на reg.ru). 'sqlite' — для локальной разработки/тестов.
    if (($d['driver'] ?? 'mysql') === 'sqlite') {
        $pdo = new PDO('sqlite:' . $d['name'], null, null, $opts);
    } else {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', $d['host'], $d['name'], $d['charset'] ?? 'utf8mb4');
        $pdo = new PDO($dsn, $d['user'], $d['pass'], $opts);
    }
    return $pdo;
}
