<?php
// База данных: MySQL на хостинге, SQLite для локальной разработки и тестов.

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $driver = cfg('DB_DRIVER', 'mysql');
    if ($driver === 'sqlite') {
        $pdo = new PDO('sqlite:' . cfg('DB_PATH', APP_DIR . '/data.sqlite'));
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA foreign_keys = ON');
    } else {
        $dsn = 'mysql:host=' . cfg('DB_HOST', 'localhost') . ';dbname=' . cfg('DB_NAME') . ';charset=utf8mb4';
        $pdo = new PDO($dsn, cfg('DB_USER'), cfg('DB_PASS'));
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    db_migrate($pdo, $driver);
    return $pdo;
}

function db_all(string $sql, array $args = []): array {
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st->fetchAll();
}

function db_one(string $sql, array $args = []): ?array {
    $st = db()->prepare($sql);
    $st->execute($args);
    $row = $st->fetch();
    return $row === false ? null : $row;
}

function db_exec(string $sql, array $args = []): int {
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st->rowCount();
}

function db_insert(string $table, array $row): int {
    $cols = array_keys($row);
    $sql = 'INSERT INTO ' . $table . ' (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')';
    db_exec($sql, array_values($row));
    return (int)db()->lastInsertId();
}

function db_update(string $table, array $row, string $where, array $args): int {
    $set = implode(', ', array_map(fn($c) => "$c = ?", array_keys($row)));
    return db_exec('UPDATE ' . $table . ' SET ' . $set . ' WHERE ' . $where, array_merge(array_values($row), $args));
}

const DB_VERSION = 1;

function db_migrate(PDO $pdo, string $driver): void {
    $sqlite = $driver === 'sqlite';
    $id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT AUTO_INCREMENT PRIMARY KEY';
    $text = $sqlite ? 'TEXT' : 'MEDIUMTEXT';
    $tail = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
    $vc = fn(int $n) => $sqlite ? 'TEXT' : "VARCHAR($n)";

    $pdo->exec('CREATE TABLE IF NOT EXISTS kv (k ' . $vc(190) . ' PRIMARY KEY, v ' . $text . ', expires INT NOT NULL DEFAULT 0)' . $tail);
    $row = $pdo->query("SELECT v FROM kv WHERE k = 'db_version'")->fetch(PDO::FETCH_ASSOC);
    if ($row && (int)json_decode($row['v']) >= DB_VERSION) return;

    $tables = [
        "users (id $id, twitch_id {$vc(32)} NOT NULL UNIQUE, login {$vc(64)} NOT NULL, display_name {$vc(64)}, avatar {$vc(400)}, email {$vc(190)},
          access_token {$vc(255)}, refresh_token {$vc(255)}, token_expires INT NOT NULL DEFAULT 0, scopes $text,
          plan {$vc(16)} NOT NULL DEFAULT 'free', plan_until INT NOT NULL DEFAULT 0, balance INT NOT NULL DEFAULT 0, banned INT NOT NULL DEFAULT 0,
          bot_enabled INT NOT NULL DEFAULT 0, bot_error $text, widget_token {$vc(64)}, theme $text,
          da_access $text, da_refresh $text, da_expires INT NOT NULL DEFAULT 0, da_last_id INT NOT NULL DEFAULT 0, da_name {$vc(64)},
          created_at INT NOT NULL DEFAULT 0, last_login INT NOT NULL DEFAULT 0)",
        "settings (user_id INT NOT NULL, skey {$vc(64)} NOT NULL, value $text, PRIMARY KEY (user_id, skey))",
        "commands (id $id, user_id INT NOT NULL, name {$vc(64)} NOT NULL, prefix {$vc(4)} NOT NULL DEFAULT '!', response $text, enabled INT NOT NULL DEFAULT 1,
          cooldown_global INT NOT NULL DEFAULT 30, cooldown_user INT NOT NULL DEFAULT 0, access {$vc(16)} NOT NULL DEFAULT 'all', allow_list $text,
          use_count INT NOT NULL DEFAULT 0, last_used INT NOT NULL DEFAULT 0, description $text, created_at INT NOT NULL DEFAULT 0)",
        "cooldowns (k {$vc(190)} PRIMARY KEY, last INT NOT NULL DEFAULT 0)",
        "chat_messages (id $id, user_id INT NOT NULL, msg_id {$vc(64)}, chatter_id {$vc(32)}, chatter_login {$vc(64)}, chatter_name {$vc(64)},
          text $text, badges $text, color {$vc(16)}, deleted INT NOT NULL DEFAULT 0, created_at INT NOT NULL DEFAULT 0)",
        "mod_actions (id $id, user_id INT NOT NULL, chatter_id {$vc(32)}, chatter_login {$vc(64)}, action {$vc(16)}, reason $text, duration INT NOT NULL DEFAULT 0,
          by_login {$vc(64)}, message $text, strikes {$vc(16)}, undone INT NOT NULL DEFAULT 0, created_at INT NOT NULL DEFAULT 0)",
        "strikes (user_id INT NOT NULL, chatter_id {$vc(32)} NOT NULL, cnt INT NOT NULL DEFAULT 0, last_at INT NOT NULL DEFAULT 0, PRIMARY KEY (user_id, chatter_id))",
        "review_queue (id $id, user_id INT NOT NULL, msg_id {$vc(64)}, chatter_id {$vc(32)}, chatter_login {$vc(64)}, text $text, reason $text,
          status {$vc(16)} NOT NULL DEFAULT 'new', created_at INT NOT NULL DEFAULT 0)",
        "songs (id $id, user_id INT NOT NULL, video_id {$vc(32)}, url $text, source {$vc(32)}, title $text, duration INT NOT NULL DEFAULT 0,
          requester {$vc(64)}, method {$vc(16)}, redemption_id {$vc(64)}, reward_id {$vc(64)}, status {$vc(16)} NOT NULL DEFAULT 'queued',
          pos INT NOT NULL DEFAULT 0, created_at INT NOT NULL DEFAULT 0, played_at INT NOT NULL DEFAULT 0)",
        "giveaways (id $id, user_id INT NOT NULL, prize $text, keyword {$vc(64)}, winners_count INT NOT NULL DEFAULT 1, rules $text,
          status {$vc(16)} NOT NULL DEFAULT 'collecting', seed {$vc(64)}, seed_hash {$vc(64)}, winners $text, excluded $text,
          created_at INT NOT NULL DEFAULT 0, ends_at INT NOT NULL DEFAULT 0, drawn_at INT NOT NULL DEFAULT 0)",
        "giveaway_entries (id $id, giveaway_id INT NOT NULL, chatter_id {$vc(32)} NOT NULL, login {$vc(64)}, display {$vc(64)}, role {$vc(16)},
          weight INT NOT NULL DEFAULT 1, created_at INT NOT NULL DEFAULT 0, UNIQUE (giveaway_id, chatter_id))",
        "donations (id $id, user_id INT NOT NULL, ext_id {$vc(64)}, username {$vc(128)}, amount INT NOT NULL DEFAULT 0, currency {$vc(8)},
          message $text, created_at INT NOT NULL DEFAULT 0, UNIQUE (user_id, ext_id))",
        "events (id $id, user_id INT NOT NULL, type {$vc(32)}, login {$vc(64)}, name {$vc(64)}, data $text, created_at INT NOT NULL DEFAULT 0)",
        "streams (user_id INT PRIMARY KEY, live INT NOT NULL DEFAULT 0, started_at INT NOT NULL DEFAULT 0, viewers INT NOT NULL DEFAULT 0,
          peak INT NOT NULL DEFAULT 0, title $text, game {$vc(128)}, thumbnail $text, updated_at INT NOT NULL DEFAULT 0)",
        "counters (user_id INT NOT NULL, name {$vc(64)} NOT NULL, value INT NOT NULL DEFAULT 0, PRIMARY KEY (user_id, name))",
        "transactions (id $id, user_id INT NOT NULL, amount INT NOT NULL, kind {$vc(32)}, comment $text, admin_login {$vc(64)}, created_at INT NOT NULL DEFAULT 0)",
        "eventsub_seen (msg_id {$vc(80)} PRIMARY KEY, created_at INT NOT NULL DEFAULT 0)",
        "follow_cache (user_id INT NOT NULL, chatter_id {$vc(32)} NOT NULL, since INT NOT NULL DEFAULT 0, checked_at INT NOT NULL DEFAULT 0, PRIMARY KEY (user_id, chatter_id))",
        "gsi (user_id INT NOT NULL, game {$vc(16)} NOT NULL, data $text, updated_at INT NOT NULL DEFAULT 0, PRIMARY KEY (user_id, game))",
    ];
    foreach ($tables as $t) $pdo->exec('CREATE TABLE IF NOT EXISTS ' . $t . $tail);

    $idx = [
        'idx_chat_user ON chat_messages (user_id, id)',
        'idx_cmd_user ON commands (user_id)',
        'idx_mod_user ON mod_actions (user_id, id)',
        'idx_songs_user ON songs (user_id, status, pos)',
        'idx_events_user ON events (user_id, id)',
        'idx_don_user ON donations (user_id, id)',
        'idx_gw_user ON giveaways (user_id, id)',
    ];
    foreach ($idx as $i) {
        try { $pdo->exec('CREATE INDEX ' . ($sqlite ? 'IF NOT EXISTS ' : '') . $i); } catch (Throwable $e) { /* индекс уже есть */ }
    }
    $pdo->prepare('DELETE FROM kv WHERE k = ?')->execute(['db_version']);
    $pdo->prepare('INSERT INTO kv (k, v, expires) VALUES (?, ?, 0)')->execute(['db_version', json_encode(DB_VERSION)]);
}
