<?php
// Помощники канала: пользователи StreOps, которым владелец разрешил управлять музыкой. Они входят под своим Twitch-аккаунтом
// и видят только те каналы, где их ник в списке помощников. Каждое их действие пишется в журнал канала.

const MGR_MAX = 20;

function mgr_list(int $uid): array {
    $l = settings_get($uid, 'managers', []);
    return is_array($l) ? array_values(array_filter($l, 'is_string')) : [];
}

function mgr_save(int $uid, array $list): void {
    settings_set($uid, 'managers', array_values($list));
}

function mgr_login_ok(string $login): bool {
    return (bool)preg_match('/^[a-z0-9_]{3,25}$/', $login);
}

// Каналы, где этот пользователь помощник
function mgr_channels(string $login): array {
    $rows = db_all("SELECT s.user_id, s.value, u.login, u.display_name FROM settings s JOIN users u ON u.id = s.user_id WHERE s.skey = 'managers' AND s.value LIKE ?", ['%"' . $login . '"%']);
    $out = [];
    foreach ($rows as $r) {
        $list = json_decode((string)$r['value'], true);
        if (is_array($list) && in_array($login, $list, true)) {
            $out[] = ['login' => $r['login'], 'name' => $r['display_name'] ?: $r['login']];
        }
    }
    return $out;
}

// Канал по нику, если текущий пользователь в его помощниках. Иначе — отказ.
function mgr_channel(array $me, string $channelLogin): array {
    $ch = db_one('SELECT * FROM users WHERE login = ?', [mb_strtolower($channelLogin)]);
    if (!$ch) fail('Канал не найден', 404);
    if (!in_array(mb_strtolower((string)$me['login']), mgr_list((int)$ch['id']), true)) fail('Ты не помощник этого канала', 403);
    return $ch;
}

// Запись в журнал канала: кто и что сделал с музыкой
function mgr_log(array $ch, string $manager, string $action, string $detail): void {
    db_insert('mod_actions', [
        'user_id' => (int)$ch['id'], 'chatter_id' => '', 'chatter_login' => '', 'action' => 'music', 'reason' => $detail,
        'duration' => 0, 'by_login' => $manager, 'message' => $action, 'strikes' => '', 'created_at' => now(),
    ]);
}

// Статистика помощника по каналу: сколько действий с музыкой и когда последнее
function mgr_stats(int $uid, string $login): array {
    $r = db_one("SELECT COUNT(*) c, MAX(created_at) last FROM mod_actions WHERE user_id = ? AND action = 'music' AND by_login = ?", [$uid, $login]);
    return ['music' => (int)($r['c'] ?? 0), 'last' => (int)($r['last'] ?? 0)];
}

// Озвучка сообщений: настройки канала
function tts_defaults(): array {
    return ['on' => false, 'access' => 'mods', 'allowList' => '', 'cooldown' => 5, 'maxLen' => 200];
}

function tts_config(int $uid): array {
    $c = settings_get($uid, 'tts', []);
    return array_replace(tts_defaults(), is_array($c) ? $c : []);
}
