<?php
// Админ-панель: кто сейчас онлайн, глобальный чёрный список зрителей и управление музыкой любого канала.

const ONLINE_WINDOW = 300; // «онлайн» — был активен за последние 5 минут
const BL_CHANNEL_LIMIT = 300; // сколько каналов обходим за один запрос, чтобы не упереться в лимиты Twitch

function online_now(int $limit = 20): array {
    $rows = db_all('SELECT login, display_name, plan, plan_until, last_seen FROM users WHERE last_seen >= ? ORDER BY last_seen DESC LIMIT ' . (int)$limit, [now() - ONLINE_WINDOW]);
    $count = (int)db_one('SELECT COUNT(*) c FROM users WHERE last_seen >= ?', [now() - ONLINE_WINDOW])['c'];
    return ['count' => $count, 'items' => array_map(fn($r) => ['login' => $r['login'], 'name' => $r['display_name'] ?: $r['login'],
        'plan' => plan_of($r), 'lastSeen' => (int)$r['last_seen']], $rows)];
}

// ---------- чёрный список зрителей ----------

function bl_login_ok(string $login): bool {
    return (bool)preg_match('/^[a-z0-9_]{3,25}$/', $login);
}

// Ищем запись по нику или по Twitch ID (ник могли поменять).
function bl_find(string $login, string $twitchId = ''): ?array {
    $login = strtolower($login);
    if ($twitchId !== '') return db_one('SELECT * FROM blacklist WHERE twitch_id = ? OR login = ?', [$twitchId, $login]);
    return db_one('SELECT * FROM blacklist WHERE login = ?', [$login]);
}

function bl_list(): array {
    return array_map(fn($r) => ['id' => (int)$r['id'], 'login' => $r['login'], 'twitchId' => $r['twitch_id'], 'reason' => $r['reason'],
        'by' => $r['by_login'], 'at' => (int)$r['created_at']], db_all('SELECT * FROM blacklist ORDER BY id DESC LIMIT 500'));
}

// Каналы, где бот сейчас работает: туда применяем бан и снятие бана.
function bl_channels(): array {
    return db_all('SELECT id, login, twitch_id FROM users WHERE bot_enabled = 1 AND banned = 0 ORDER BY id LIMIT ' . BL_CHANNEL_LIMIT);
}

// Добавляем в список. Twitch ID пытаемся узнать сразу, чтобы ловить зрителя по ID, даже если он сменит ник.
// banNow: сразу банит его во всех каналах, где бот модератор.
function bl_add(array $admin, string $login, string $reason, bool $banNow): array {
    $login = strtolower(trim($login));
    if (!bl_login_ok($login)) fail('Ник Twitch: от 3 до 25 знаков, латиница, цифры и «_»');
    $reason = mb_substr(trim($reason), 0, 300);
    if ($reason === '') fail('Напиши причину: её увидит администратор в списке и журнале');
    $tw = tw_get_user_by_login($login);
    $twitchId = $tw ? (string)$tw['id'] : '';
    $row = db_one('SELECT * FROM blacklist WHERE login = ?', [$login]);
    if ($row) {
        db_update('blacklist', ['reason' => $reason, 'twitch_id' => $twitchId ?: $row['twitch_id'], 'by_login' => $admin['login']], 'id = ?', [$row['id']]);
    } else {
        db_insert('blacklist', ['login' => $login, 'twitch_id' => $twitchId, 'reason' => $reason, 'by_login' => $admin['login'], 'created_at' => now()]);
    }
    $result = ['ok' => true, 'twitchFound' => $twitchId !== '', 'channels' => 0, 'banned' => 0];
    if ($banNow && $twitchId !== '') {
        foreach (bl_channels() as $ch) {
            $result['channels']++;
            if (tw_ban((string)$ch['twitch_id'], $twitchId, 0, 'Чёрный список StreOps: ' . $reason)) $result['banned']++;
        }
    }
    logline('admin', $admin['login'] . ' blacklisted ' . $login . ' (' . $reason . ')');
    return $result;
}

// Убираем из списка. unbanNow: снимаем бан во всех каналах, где бот модератор.
function bl_remove(array $admin, int $id, bool $unbanNow): array {
    $row = db_one('SELECT * FROM blacklist WHERE id = ?', [$id]);
    if (!$row) fail('Запись уже удалена', 404);
    db_exec('DELETE FROM blacklist WHERE id = ?', [$id]);
    $result = ['ok' => true, 'channels' => 0, 'unbanned' => 0];
    if ($unbanNow && $row['twitch_id'] !== '') {
        foreach (bl_channels() as $ch) {
            $result['channels']++;
            if (tw_unban((string)$ch['twitch_id'], (string)$row['twitch_id'])) $result['unbanned']++;
        }
    }
    logline('admin', $admin['login'] . ' removed ' . $row['login'] . ' from blacklist');
    return $result;
}

// Вызывается из бота для каждого сообщения: если автор в чёрном списке, удаляем сообщение и банем в этом канале.
// Возвращает true — сообщение дальше не обрабатываем.
function bl_enforce(array $user, string $chatterId, string $login, string $msgId): bool {
    if (!bl_find($login, $chatterId)) return false;
    if ($msgId !== '') tw_delete_message((string)$user['twitch_id'], $msgId);
    $key = 'bl_ban:' . $user['id'] . ':' . $chatterId;
    if ($chatterId !== '' && !kv_get($key)) {
        tw_ban((string)$user['twitch_id'], $chatterId, 0, 'Чёрный список StreOps');
        kv_set($key, 1, 86400); // не банем повторно каждый раз, но проверим снова через сутки
    }
    return true;
}

// ---------- музыка любого канала ----------

function admin_channel(string $login): array {
    $ch = db_one('SELECT * FROM users WHERE login = ?', [strtolower(trim($login))]);
    if (!$ch) fail('Канал с таким ником не найден', 404);
    return $ch;
}

function admin_music_state(array $ch): array {
    $uid = (int)$ch['id'];
    $playing = db_one("SELECT * FROM songs WHERE user_id = ? AND status = 'playing' ORDER BY id DESC LIMIT 1", [$uid]);
    return [
        'channel' => ['login' => $ch['login'], 'name' => $ch['display_name'] ?: $ch['login'], 'plan' => plan_of($ch)],
        'orders' => !empty(music_config($uid)['open']),
        'playing' => $playing ? song_row($playing) : null,
        'queue' => array_map('song_row', db_all("SELECT * FROM songs WHERE user_id = ? AND status = 'queued' ORDER BY pos, id LIMIT 50", [$uid])),
        'pending' => array_map('song_row', db_all("SELECT * FROM songs WHERE user_id = ? AND status = 'pending' ORDER BY id LIMIT 30", [$uid])),
        'history' => array_map('song_row', db_all("SELECT * FROM songs WHERE user_id = ? AND status IN ('played','skipped','rejected') ORDER BY played_at DESC, id DESC LIMIT 15", [$uid])),
    ];
}

// Действия админа с очередью: то же, что делает стример, но запись уходит в журнал канала как действие администратора.
function admin_music_do(array $admin, array $ch, string $action, int $id): void {
    music_act($ch, $action, $id);
    mgr_log($ch, 'админ ' . $admin['login'], $action, $id ? 'трек #' . $id : 'очередь');
}
