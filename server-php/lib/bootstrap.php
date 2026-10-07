<?php
/**
 * Общая инициализация API: конфиг, подключение к БД (с авто-созданием таблиц),
 * вспомогательные функции (ответы, телефон, токены), сериализация пользователя.
 */
declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');

// ------------------------------------------------------------------ конфиг
$cfgPath = dirname(__DIR__) . '/config.php';
if (!is_file($cfgPath)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Сервер не настроен: отсутствует config.php', 'code' => 'NO_CONFIG'], JSON_UNESCAPED_UNICODE);
    exit;
}
$CONFIG = require $cfgPath;

// Перехват любой необработанной ошибки: пишем детали в лог (закрыт от веба
// правилом .htaccess ^lib/), а наружу отдаём аккуратный JSON. При 'debug'=>true
// текст ошибки возвращается в ответе — чтобы быстро найти причину 500.
$__debug = !empty($CONFIG['debug']);
$__emit_error = function (string $msg, string $where) use ($__debug): void {
    @error_log('[' . gmdate('c') . "] $msg @ $where\n", 3, __DIR__ . '/error.log');
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    echo json_encode(
        $__debug
            ? ['error' => $msg, 'where' => $where, 'code' => 'SERVER_ERROR']
            : ['error' => 'Внутренняя ошибка сервера. Попробуйте позже.', 'code' => 'SERVER_ERROR'],
        JSON_UNESCAPED_UNICODE,
    );
};
set_exception_handler(function (Throwable $e) use ($__emit_error) {
    $__emit_error($e->getMessage(), basename($e->getFile()) . ':' . $e->getLine());
});
register_shutdown_function(function () use ($__emit_error) {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        $__emit_error($e['message'], basename($e['file']) . ':' . $e['line']);
    }
});

$DATA = require __DIR__ . '/data.php';

date_default_timezone_set($CONFIG['venue_tz'] ?? 'Asia/Yakutsk');

function cfg(string $key, $default = null) {
    global $CONFIG;
    return $CONFIG[$key] ?? $default;
}
function data_all(): array {
    global $DATA;
    static $merged = null;
    if ($merged !== null) return $merged;
    $merged = $DATA;
    // накладываем сохранённые в админке правки (kv_store: ключ data_overrides)
    try {
        $st = db()->prepare('SELECT v FROM kv_store WHERE k = ?');
        $st->execute(['data_overrides']);
        $raw = $st->fetchColumn();
        $over = $raw ? json_decode((string)$raw, true) : null;
        if (is_array($over)) {
            foreach (['site', 'contacts', 'booking', 'loyalty', 'recordings'] as $k) {
                if (isset($over[$k]) && is_array($over[$k]) && isset($merged[$k]) && is_array($merged[$k])) {
                    $merged[$k] = array_merge($merged[$k], $over[$k]);
                }
            }
            if (isset($over['roles']) && is_array($over['roles'])) {
                foreach ($over['roles'] as $rk => $perms) {
                    // владельца не трогаем (у него всегда '*')
                    if ($rk !== 'owner' && isset($merged['roles'][$rk]) && ($merged['roles'][$rk]['permissions'] ?? null) !== '*' && is_array($perms)) {
                        $merged['roles'][$rk]['permissions'] = array_values($perms);
                    }
                }
            }
        }
    } catch (Throwable $e) {
        // БД ещё не готова — работаем на статичных данных
    }
    return $merged;
}

/** Сохранить правку раздела данных в kv_store (мержится в data_all на следующих запросах). */
function data_save_override(string $section, $value): void {
    $st = db()->prepare('SELECT v FROM kv_store WHERE k = ?');
    $st->execute(['data_overrides']);
    $raw = $st->fetchColumn();
    $over = $raw ? json_decode((string)$raw, true) : [];
    if (!is_array($over)) $over = [];
    $over[$section] = $value;
    db()->prepare('REPLACE INTO kv_store (k, v) VALUES (?, ?)')
        ->execute(['data_overrides', json_encode($over, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
}

// ------------------------------------------------------------------ ответы
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(int $code, string $error, ?string $ecode = null, array $extra = []): void {
    out(array_merge(['error' => $error, 'code' => $ecode], $extra), $code);
}
function not_found(string $msg = 'Не найдено'): void { fail(404, $msg, 'NOT_FOUND'); }
function forbidden(string $msg = 'Недостаточно прав'): void { fail(403, $msg, 'FORBIDDEN'); }

/** Тело запроса: JSON или форма. */
function body(): array {
    static $cache = null;
    if ($cache !== null) return $cache;
    $raw = file_get_contents('php://input');
    $parsed = [];
    if ($raw !== '' && $raw !== false) {
        $j = json_decode($raw, true);
        if (is_array($j)) $parsed = $j;
    }
    if (!$parsed && !empty($_POST)) $parsed = $_POST;
    return $cache = $parsed;
}

function s($v): string { return is_string($v) ? $v : (is_scalar($v) ? (string)$v : ''); }
function i($v, int $default = 0): int { return is_numeric($v) ? (int)round((float)$v) : $default; }

// ------------------------------------------------------------------ идентификаторы и время
function uid(): string {
    return 'u' . base_convert((string)(int)(microtime(true) * 1000), 10, 36) . bin2hex(random_bytes(4));
}
function now_iso(): string { return gmdate('Y-m-d\TH:i:s') . '.000Z'; }

// ------------------------------------------------------------------ телефон
function normalize_phone($input): ?string {
    if (!is_string($input)) return null;
    $d = preg_replace('/\D/', '', $input);
    $len = strlen($d);
    if ($len === 11 && ($d[0] === '8' || $d[0] === '7')) $d = '7' . substr($d, 1);
    elseif ($len === 10) $d = '7' . $d;
    else return null;
    return '+' . $d;
}
function phone_or_fail($v): string {
    $p = normalize_phone($v);
    if ($p === null) fail(400, 'Неверный формат телефона', 'VALIDATION');
    return $p;
}
/** Выдернуть телефоноподобную подстроку из произвольного текста (vCard, сообщение). */
function extract_phone(?string $s): ?string {
    if (!is_string($s) || $s === '') return null;
    if (preg_match('/(\+?\d[\d\s\-()]{9,}\d)/', $s, $m)) return $m[1];
    return null;
}

// ------------------------------------------------------------------ база данных
function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $c = cfg('db', []);
    $driver = $c['driver'] ?? 'mysql';
    try {
        if ($driver === 'sqlite') {
            $pdo = new PDO('sqlite:' . ($c['sqlite_path'] ?? dirname(__DIR__) . '/data.sqlite'));
            $pdo->exec('PRAGMA journal_mode=WAL');
        } else {
            $dsn = "mysql:host={$c['host']};dbname={$c['name']};charset=" . ($c['charset'] ?? 'utf8mb4');
            $pdo = new PDO($dsn, $c['user'], $c['pass']);
        }
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $extra = !empty($GLOBALS['CONFIG']['debug']) ? ['detail' => $e->getMessage()] : [];
        fail(500, 'Не удалось подключиться к базе данных. Проверьте данные БД в config.php.', 'DB_CONNECT', $extra);
    }
    try {
        ensure_schema($pdo, $driver);
    } catch (Throwable $e) {
        $extra = !empty($GLOBALS['CONFIG']['debug']) ? ['detail' => $e->getMessage()] : [];
        fail(500, 'Не удалось создать таблицы в базе. Импортируйте server-php/schema.sql через phpMyAdmin.', 'DB_SCHEMA', $extra);
    }
    return $pdo;
}

function ensure_schema(PDO $pdo, string $driver): void {
    $suffix = $driver === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    foreach (schema_tables() as $name => $cols) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS $name $cols$suffix");
    }
}

/** Ожидаемые имена колонок таблицы (из её DDL) — для проверки/починки схемы. */
function schema_columns(string $cols): array {
    $out = [];
    foreach (explode("\n", $cols) as $line) {
        $line = trim($line);
        if (!preg_match('/^([a-z_]+)\b/i', $line, $m)) continue;
        $tok = strtolower($m[1]);
        if (in_array($tok, ['unique', 'primary', 'key', 'constraint', 'foreign', 'index'], true)) continue;
        $out[] = $tok;
    }
    return $out;
}

function schema_tables(): array {
    return [
        'users' => "(
            id VARCHAR(40) PRIMARY KEY,
            phone VARCHAR(20) NOT NULL UNIQUE,
            phone_verified INT NOT NULL DEFAULT 0,
            name VARCHAR(80),
            birth_date VARCHAR(32),
            email VARCHAR(120),
            password_hash VARCHAR(255),
            points INT NOT NULL DEFAULT 0,
            last_visit_at VARCHAR(32),
            role_key VARCHAR(20),
            blocked INT NOT NULL DEFAULT 0,
            messenger VARCHAR(12) NOT NULL DEFAULT 'TELEGRAM',
            telegram_chat_id VARCHAR(40),
            vk_user_id VARCHAR(40),
            max_user_id VARCHAR(40),
            notify_bookings INT NOT NULL DEFAULT 1,
            notify_reminders INT NOT NULL DEFAULT 1,
            notify_promo INT NOT NULL DEFAULT 0,
            created_at VARCHAR(32) NOT NULL
        )",
        'auth_codes' => "(
            id VARCHAR(40) PRIMARY KEY,
            phone VARCHAR(20) NOT NULL,
            purpose VARCHAR(40) NOT NULL,
            code_hash VARCHAR(255) NOT NULL,
            attempts INT NOT NULL DEFAULT 0,
            expires_at INT NOT NULL,
            consumed INT NOT NULL DEFAULT 0,
            created_at INT NOT NULL
        )",
        'sessions' => "(
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(40) NOT NULL,
            expires_at INT NOT NULL,
            created_at VARCHAR(32) NOT NULL
        )",
        'bookings' => "(
            id VARCHAR(40) PRIMARY KEY,
            user_id VARCHAR(40) NOT NULL,
            quest_id VARCHAR(40) NOT NULL,
            start_at VARCHAR(32) NOT NULL,
            end_at VARCHAR(32) NOT NULL,
            players_count INT NOT NULL,
            ages TEXT,
            status VARCHAR(16) NOT NULL DEFAULT 'NEW',
            source VARCHAR(12) NOT NULL DEFAULT 'WEB',
            base_price INT NOT NULL DEFAULT 0,
            discount_percent INT NOT NULL DEFAULT 0,
            discount_amount INT NOT NULL DEFAULT 0,
            promo_code VARCHAR(40),
            final_price INT NOT NULL DEFAULT 0,
            prepaid INT NOT NULL DEFAULT 0,
            comment TEXT,
            admin_note TEXT,
            is_double_session INT NOT NULL DEFAULT 0,
            linked_booking_id VARCHAR(40),
            passed INT,
            time_spent_min INT,
            points_awarded INT NOT NULL DEFAULT 0,
            created_at VARCHAR(32) NOT NULL
        )",
        'holds' => "(
            id VARCHAR(40) PRIMARY KEY,
            quest_id VARCHAR(40) NOT NULL,
            user_id VARCHAR(40) NOT NULL,
            start_at VARCHAR(32) NOT NULL,
            end_at VARCHAR(32) NOT NULL,
            expires_at VARCHAR(32) NOT NULL
        )",
        'points_log' => "(
            id VARCHAR(40) PRIMARY KEY,
            user_id VARCHAR(40) NOT NULL,
            delta INT NOT NULL,
            reason VARCHAR(40) NOT NULL,
            comment TEXT,
            booking_id VARCHAR(40),
            created_at VARCHAR(32) NOT NULL
        )",
        'admin_logs' => "(
            id VARCHAR(40) PRIMARY KEY,
            admin_id VARCHAR(40) NOT NULL,
            action VARCHAR(60) NOT NULL,
            entity VARCHAR(40) NOT NULL,
            entity_id VARCHAR(40),
            details TEXT,
            created_at VARCHAR(32) NOT NULL
        )",
        // Служебное хранилище (offset/marker опроса ботов и т.п.)
        'kv_store' => "(
            k VARCHAR(64) PRIMARY KEY,
            v TEXT
        )",
        // Связки «номер телефона ↔ чат мессенджера» (пользователь поделился номером боту)
        'messenger_links' => "(
            id VARCHAR(40) PRIMARY KEY,
            platform VARCHAR(12) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            chat_id VARCHAR(40) NOT NULL,
            username VARCHAR(80),
            created_at VARCHAR(32) NOT NULL,
            UNIQUE (platform, phone)
        )",
    ];
}

// ------------------------------------------------------------------ роли и права
function role_def(string $key): ?array {
    $roles = data_all()['roles'] ?? [];
    return $roles[$key] ?? null;
}
function effective_role(array $u): ?string {
    $owners = cfg('owner_phones', []);
    if (in_array($u['phone'] ?? '', $owners, true)) return 'owner';
    return $u['role_key'] ?: null;
}
function user_perms(?array $u): array {
    if (!$u) return [];
    $key = effective_role($u);
    if (!$key) return [];
    $def = role_def($key);
    if (!$def) return [];
    if (($def['permissions'] ?? null) === '*') return all_perms();
    return $def['permissions'] ?? [];
}
function all_perms(): array {
    return ['dashboard.view','bookings.view','bookings.edit','users.view','users.edit','points.edit','quests.edit','content.edit','recordings.manage','reports.view','payments.view','promo.edit','settings.edit','logs.view','roles.manage'];
}
/** Человеческие подписи прав — для раздела «Роли» в админке. */
function perm_labels(): array {
    return [
        'dashboard.view'    => 'Дашборд',
        'bookings.view'     => 'Просмотр заявок',
        'bookings.edit'     => 'Редактирование заявок',
        'users.view'        => 'Просмотр пользователей',
        'users.edit'        => 'Работа с пользователями',
        'points.edit'       => 'Корректировка баллов',
        'quests.edit'       => 'Управление квестами',
        'content.edit'      => 'Тексты и контакты',
        'recordings.manage' => 'Видеозаписи',
        'reports.view'      => 'Отчётность',
        'payments.view'     => 'Платежи',
        'promo.edit'        => 'Промокоды и сертификаты',
        'settings.edit'     => 'Настройки записи и лояльности',
        'logs.view'         => 'Журнал действий',
        'roles.manage'      => 'Управление ролями',
    ];
}
function can(?array $u, string $perm): bool { return in_array($perm, user_perms($u), true); }

// ------------------------------------------------------------------ токены доступа
function b64url(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64url_decode(string $s): string { return base64_decode(strtr($s, '-_', '+/')); }

function make_access_token(string $userId): string {
    $payload = json_encode(['uid' => $userId, 'exp' => time() + 900], JSON_UNESCAPED_SLASHES);
    $body = b64url($payload);
    $sig = b64url(hash_hmac('sha256', $body, (string)cfg('app_secret'), true));
    return "$body.$sig";
}
function verify_access_token(?string $token): ?string {
    if (!$token || substr_count($token, '.') !== 1) return null;
    [$body, $sig] = explode('.', $token);
    $expected = b64url(hash_hmac('sha256', $body, (string)cfg('app_secret'), true));
    if (!hash_equals($expected, $sig)) return null;
    $payload = json_decode(b64url_decode($body), true);
    if (!is_array($payload) || ($payload['exp'] ?? 0) < time()) return null;
    return $payload['uid'] ?? null;
}

/** Текущий пользователь по заголовку Authorization: Bearer <token>. */
function current_user(): ?array {
    static $resolved = false; static $u = null;
    if ($resolved) return $u;
    $resolved = true;
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (!$hdr && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $hdr = $v;
    }
    if (!preg_match('/Bearer\s+(.+)/i', $hdr, $m)) return $u = null;
    $uidv = verify_access_token(trim($m[1]));
    if (!$uidv) return $u = null;
    $st = db()->prepare('SELECT * FROM users WHERE id = ?');
    $st->execute([$uidv]);
    $row = $st->fetch();
    return $u = ($row ?: null);
}
function require_user(): array {
    $u = current_user();
    if (!$u) fail(401, 'Требуется авторизация', 'UNAUTHORIZED');
    if ((int)$u['blocked']) fail(403, 'Аккаунт заблокирован. Свяжитесь с администратором.', 'BLOCKED');
    return $u;
}
function require_perm(string ...$ps): array {
    $u = require_user();
    if (!user_perms($u)) forbidden();
    foreach ($ps as $p) if (!can($u, $p)) forbidden();
    return $u;
}

// ------------------------------------------------------------------ refresh-сессия (cookie)
function set_session_cookies(string $refreshToken): void {
    $secure = (bool)cfg('cookie_secure', true);
    $domain = (string)cfg('cookie_domain', '');
    $opts = ['expires' => time() + 30 * 86400, 'path' => '/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax'];
    if ($domain) $opts['domain'] = $domain;
    setcookie('rt', $refreshToken, $opts);
    // маркер для фронтенда (не HttpOnly): есть сессия — стоит попробовать refresh
    $mark = $opts; $mark['httponly'] = false;
    setcookie('hs', '1', $mark);
}
function clear_session_cookies(): void {
    $domain = (string)cfg('cookie_domain', '');
    $base = ['expires' => time() - 3600, 'path' => '/'];
    if ($domain) $base['domain'] = $domain;
    setcookie('rt', '', $base);
    setcookie('hs', '', $base);
}
function start_session(array $u): array {
    $rt = bin2hex(random_bytes(32));
    $id = hash('sha256', $rt);
    $st = db()->prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?,?,?,?)');
    $st->execute([$id, $u['id'], time() + 30 * 86400, now_iso()]);
    set_session_cookies($rt);
    return auth_response($u);
}
function auth_response(array $u): array {
    return [
        'accessToken' => make_access_token($u['id']),
        'expiresIn'   => 900,
        'user'        => serialize_user($u),
        'needsProfile'=> empty($u['name']),
    ];
}

// ------------------------------------------------------------------ сериализация пользователя
function serialize_user(array $u): array {
    $perms = user_perms($u);
    $role = effective_role($u);
    return [
        'id'            => $u['id'],
        'phone'         => $u['phone'],
        'phoneVerified' => (bool)$u['phone_verified'],
        'name'          => $u['name'],
        'birthDate'     => $u['birth_date'],
        'email'         => $u['email'],
        'points'        => (int)$u['points'],
        'messenger'     => $u['messenger'],
        'linked'        => ['telegram' => !empty($u['telegram_chat_id']), 'vk' => !empty($u['vk_user_id']), 'max' => !empty($u['max_user_id'])],
        'notify'        => ['bookings' => (bool)$u['notify_bookings'], 'reminders' => (bool)$u['notify_reminders'], 'promo' => (bool)$u['notify_promo']],
        'hasPassword'   => !empty($u['password_hash']),
        'isStaff'       => count($perms) > 0,
        'permissions'   => $perms,
        'roleName'      => in_array('roles.manage', $perms, true) && $role ? (role_def($role)['name'] ?? null) : null,
        'createdAt'     => $u['created_at'],
    ];
}

function find_user_by_phone(string $phone): ?array {
    $st = db()->prepare('SELECT * FROM users WHERE phone = ?');
    $st->execute([$phone]);
    return $st->fetch() ?: null;
}
function find_user(string $id): ?array {
    $st = db()->prepare('SELECT * FROM users WHERE id = ?');
    $st->execute([$id]);
    return $st->fetch() ?: null;
}
