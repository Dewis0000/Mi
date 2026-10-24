<?php
// StreOps Connect: серверы с текстовыми каналами, личные сообщения, ответы, реакции, роли и приглашения.
// Все маршруты connect.* обрабатывает connect_dispatch(); для остальных возвращает false.

const CONNECT_MAX_TEXT = 2000;
const CONNECT_MAX_SERVERS = 20;   // серверов, которыми владеет один пользователь
const CONNECT_MAX_CHANNELS = 50;
const CONNECT_MAX_MEMBERS = 500;
const CONNECT_RATE_MAX = 5;       // сообщений в окне
const CONNECT_RATE_WINDOW = 10;   // секунд
const CONNECT_TYPING_TTL = 6;     // секунд, сколько «печатает…» держится после последнего сигнала
const CONNECT_HISTORY = 50;       // сообщений за один запрос
const CONNECT_EMOJI = ['👍', '❤️', '😂', '🔥', '😮', '😢', '🎉', '👀'];
const CONNECT_RANK = ['member' => 1, 'admin' => 2, 'owner' => 3];
const CONNECT_MSG_SELECT = 'SELECT m.*, u.login, u.display_name FROM connect_messages m JOIN users u ON u.id = m.user_id';

function connect_name(array $u): string { return (string)($u['display_name'] ?: $u['login']); }

function connect_online(array $u): bool { return (int)($u['last_seen'] ?? 0) >= now() - ONLINE_WINDOW; }

// Роль пользователя на сервере или null, если он не участник
function connect_role(int $serverId, int $uid): ?string {
    $r = db_one('SELECT role FROM connect_members WHERE server_id = ? AND user_id = ?', [$serverId, $uid]);
    return $r ? (string)$r['role'] : null;
}

// Требует участия на сервере и роли не ниже $min; возвращает роль
function connect_need(int $serverId, int $uid, string $min = 'member'): string {
    $role = connect_role($serverId, $uid);
    if (!$role) fail('Ты не участник этого сервера', 403);
    if (CONNECT_RANK[$role] < CONNECT_RANK[$min]) fail($min === 'owner' ? 'Это может сделать только владелец сервера' : 'Нужна роль администратора', 403);
    return $role;
}

// Текст из формы: убираем управляющие символы, проверяем длину
function connect_text(string $s, string $what, int $min, int $max): string {
    $s = str_replace(["\r\n", "\r"], "\n", $s);
    $s = preg_replace('/[^\P{C}\n\t]/u', '', $s) ?? '';
    $s = trim($s);
    $n = mb_strlen($s);
    if ($n < $min) fail($what . ': нужно хотя бы ' . $min . ' симв.');
    if ($n > $max) fail($what . ': не длиннее ' . $max . ' симв.');
    return $s;
}

// Название канала: как в мессенджерах — строчные буквы, цифры, «-» и «_»
function connect_channel_name(string $s): string {
    $s = ltrim(mb_strtolower(trim($s)), '#');
    $s = preg_replace('/\s+/u', '-', $s) ?? '';
    if (!preg_match('/^[\p{L}\p{N}_-]{1,32}$/u', $s)) fail('Название канала: 1–32 символа, буквы, цифры, «-» и «_»');
    return $s;
}

// Чат, в котором работаем: канал сервера или личные сообщения. Проверяет доступ и возвращает права.
function connect_scope(string $scope, int $id, int $uid): array {
    if ($scope === 'c') {
        $ch = db_one('SELECT * FROM connect_channels WHERE id = ?', [$id]) ?? fail('Такого канала нет', 404);
        $role = connect_need((int)$ch['server_id'], $uid);
        return ['scope' => 'c', 'id' => $id, 'serverId' => (int)$ch['server_id'], 'role' => $role, 'manage' => CONNECT_RANK[$role] >= CONNECT_RANK['admin'], 'channel' => $ch];
    }
    if ($scope === 'd') {
        $dm = db_one('SELECT * FROM connect_dms WHERE id = ?', [$id]) ?? fail('Такого чата нет', 404);
        if ((int)$dm['a_id'] !== $uid && (int)$dm['b_id'] !== $uid) fail('Это не твой чат', 403);
        return ['scope' => 'd', 'id' => $id, 'serverId' => 0, 'role' => null, 'manage' => false, 'dm' => $dm];
    }
    fail('Неизвестный чат');
}

// Сколько сообщений в чате пришло после последнего прочитанного
function connect_unread(string $scope, int $id, int $uid): int {
    $r = db_one('SELECT last_id FROM connect_reads WHERE user_id = ? AND scope = ? AND scope_id = ?', [$uid, $scope, $id]);
    $last = $r ? (int)$r['last_id'] : 0;
    return (int)db_one('SELECT COUNT(*) c FROM connect_messages WHERE scope = ? AND scope_id = ? AND id > ? AND user_id <> ? AND deleted = 0', [$scope, $id, $last, $uid])['c'];
}

// При вступлении старые сообщения не считаем непрочитанными
function connect_mark_all_read(int $serverId, int $uid): void {
    foreach (db_all('SELECT id FROM connect_channels WHERE server_id = ?', [$serverId]) as $ch) {
        $last = (int)(db_one('SELECT MAX(id) m FROM connect_messages WHERE scope = ? AND scope_id = ?', ['c', (int)$ch['id']])['m'] ?? 0);
        connect_set_read('c', (int)$ch['id'], $uid, $last);
    }
}

function connect_set_read(string $scope, int $id, int $uid, int $last): void {
    $r = db_one('SELECT last_id FROM connect_reads WHERE user_id = ? AND scope = ? AND scope_id = ?', [$uid, $scope, $id]);
    if (!$r) db_insert('connect_reads', ['user_id' => $uid, 'scope' => $scope, 'scope_id' => $id, 'last_id' => $last]);
    elseif ($last > (int)$r['last_id']) db_exec('UPDATE connect_reads SET last_id = ? WHERE user_id = ? AND scope = ? AND scope_id = ?', [$last, $uid, $scope, $id]);
}

// Сообщения вместе с авторами, реакциями и ответами — в том виде, в каком их рисует страница
function connect_views(array $rows, int $me): array {
    if (!$rows) return [];
    $ids = array_map(fn($r) => (int)$r['id'], $rows);
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $reacts = [];
    foreach (db_all("SELECT message_id, emoji, user_id FROM connect_reactions WHERE message_id IN ($ph) ORDER BY emoji", $ids) as $x) $reacts[(int)$x['message_id']][] = $x;
    $replyIds = array_values(array_unique(array_filter(array_map(fn($r) => (int)$r['reply_to'], $rows))));
    $replies = [];
    if ($replyIds) {
        $rph = implode(',', array_fill(0, count($replyIds), '?'));
        foreach (db_all(CONNECT_MSG_SELECT . " WHERE m.id IN ($rph)", $replyIds) as $x) $replies[(int)$x['id']] = $x;
    }
    return array_map(function ($r) use ($reacts, $replies, $me) {
        $id = (int)$r['id'];
        $deleted = (int)$r['deleted'] === 1;
        $sum = [];
        foreach ($reacts[$id] ?? [] as $x) {
            $e = (string)$x['emoji'];
            $sum[$e] ??= ['emoji' => $e, 'count' => 0, 'mine' => false];
            $sum[$e]['count']++;
            if ((int)$x['user_id'] === $me) $sum[$e]['mine'] = true;
        }
        $rep = null;
        $rr = $replies[(int)$r['reply_to']] ?? null;
        if ($rr) {
            $rdel = (int)$rr['deleted'] === 1;
            $rep = ['id' => (int)$rr['id'], 'name' => connect_name($rr), 'deleted' => $rdel, 'text' => $rdel ? '' : mb_substr((string)$rr['text'], 0, 120)];
        }
        return ['id' => $id, 'text' => $deleted ? '' : (string)$r['text'], 'deleted' => $deleted,
            'user' => ['id' => (int)$r['user_id'], 'login' => (string)$r['login'], 'name' => connect_name($r)],
            'mine' => (int)$r['user_id'] === $me, 'at' => (int)$r['created_at'], 'editedAt' => (int)$r['edited_at'],
            'replyTo' => $rep, 'reactions' => array_values($sum)];
    }, $rows);
}

// Последние сообщения чата (или более ранние, если задан before), по возрастанию id
function connect_history(array $sc, int $me, int $before = 0): array {
    $sql = CONNECT_MSG_SELECT . ' WHERE m.scope = ? AND m.scope_id = ?' . ($before ? ' AND m.id < ?' : '') . ' ORDER BY m.id DESC LIMIT ' . (CONNECT_HISTORY + 1);
    $params = [$sc['scope'], $sc['id']];
    if ($before) $params[] = $before;
    $rows = db_all($sql, $params);
    $more = count($rows) > CONNECT_HISTORY;
    $rows = array_reverse(array_slice($rows, 0, CONNECT_HISTORY));
    return [connect_views($rows, $me), $more];
}

// «Печатает…»: карта uid → до какого времени. Записи истекают сами
function connect_typing_key(array $sc): string { return 'connect:typing:' . $sc['scope'] . $sc['id']; }

function connect_typers(array $sc, int $me): array {
    $map = kv_get(connect_typing_key($sc)) ?: [];
    $out = [];
    foreach ($map as $uid => $until) {
        if ((int)$until < now() || (int)$uid === $me) continue;
        $u = db_one('SELECT login, display_name FROM users WHERE id = ?', [(int)$uid]);
        if ($u) $out[] = connect_name($u);
    }
    return $out;
}

function connect_typing_set(array $sc, int $uid, bool $on): void {
    $k = connect_typing_key($sc);
    $map = kv_get($k) ?: [];
    $t = now();
    foreach ($map as $x => $until) if ((int)$until < $t) unset($map[$x]);
    if ($on) $map[$uid] = $t + CONNECT_TYPING_TTL;
    else unset($map[$uid]);
    kv_set($k, $map, 120);
}

function connect_rate(int $uid): void {
    $n = (int)db_one('SELECT COUNT(*) c FROM connect_messages WHERE user_id = ? AND created_at >= ?', [$uid, now() - CONNECT_RATE_WINDOW])['c'];
    if ($n >= CONNECT_RATE_MAX) fail('Слишком часто: подожди несколько секунд', 429);
}

// Удаляем канал вместе с его сообщениями, реакциями и отметками прочтения
function connect_purge_channel(int $cid): void {
    db_exec('DELETE FROM connect_reactions WHERE message_id IN (SELECT id FROM connect_messages WHERE scope = ? AND scope_id = ?)', ['c', $cid]);
    db_exec('DELETE FROM connect_messages WHERE scope = ? AND scope_id = ?', ['c', $cid]);
    db_exec('DELETE FROM connect_reads WHERE scope = ? AND scope_id = ?', ['c', $cid]);
    db_exec('DELETE FROM connect_channels WHERE id = ?', [$cid]);
}

// Сообщение, которое пользователь может изменить: своё, либо он управляет каналом
function connect_message(int $id): array {
    $m = db_one(CONNECT_MSG_SELECT . ' WHERE m.id = ?', [$id]) ?? fail('Сообщение не найдено', 404);
    return $m;
}

function connect_member_view(array $m): array {
    return ['id' => (int)$m['id'], 'login' => (string)$m['login'], 'name' => connect_name($m), 'role' => (string)$m['role'], 'online' => connect_online($m)];
}

function connect_dispatch(string $r): bool {
    switch ($r) {
        // ---------- главный экран: серверы, личные сообщения, непрочитанное ----------
        case 'connect.state': {
            $u = require_user();
            $uid = (int)$u['id'];
            $servers = [];
            foreach (db_all('SELECT s.id, s.name, m.role FROM connect_members m JOIN connect_servers s ON s.id = m.server_id WHERE m.user_id = ? ORDER BY m.joined_at, s.id', [$uid]) as $s) {
                $unread = 0;
                foreach (db_all('SELECT id FROM connect_channels WHERE server_id = ?', [(int)$s['id']]) as $ch) $unread += connect_unread('c', (int)$ch['id'], $uid);
                $servers[] = ['id' => (int)$s['id'], 'name' => (string)$s['name'], 'role' => (string)$s['role'], 'unread' => $unread];
            }
            $dms = [];
            foreach (db_all('SELECT * FROM connect_dms WHERE a_id = ? OR b_id = ?', [$uid, $uid]) as $d) {
                $peerId = (int)$d['a_id'] === $uid ? (int)$d['b_id'] : (int)$d['a_id'];
                $p = db_one('SELECT id, login, display_name, last_seen FROM users WHERE id = ?', [$peerId]);
                if (!$p) continue;
                $last = db_one('SELECT text, deleted, created_at FROM connect_messages WHERE scope = ? AND scope_id = ? ORDER BY id DESC LIMIT 1', ['d', (int)$d['id']]);
                $dms[] = ['id' => (int)$d['id'], 'peer' => ['id' => $peerId, 'login' => (string)$p['login'], 'name' => connect_name($p), 'online' => connect_online($p)],
                    'unread' => connect_unread('d', (int)$d['id'], $uid),
                    'last' => $last && !(int)$last['deleted'] ? mb_substr((string)$last['text'], 0, 80) : '',
                    'at' => $last ? (int)$last['created_at'] : (int)$d['created_at']];
            }
            usort($dms, fn($a, $b) => $b['at'] <=> $a['at']);
            json_out(['ok' => true, 'me' => connect_user($u), 'servers' => $servers, 'dms' => $dms,
                'limits' => ['text' => CONNECT_MAX_TEXT, 'emoji' => CONNECT_EMOJI]]);
        }

        // ---------- серверы ----------
        case 'connect.server.create': {
            $u = require_user();
            $uid = (int)$u['id'];
            $name = connect_text(in_str('name', 80), 'Название сервера', 2, 64);
            if ((int)db_one('SELECT COUNT(*) c FROM connect_servers WHERE owner_id = ?', [$uid])['c'] >= CONNECT_MAX_SERVERS) fail('Больше ' . CONNECT_MAX_SERVERS . ' своих серверов создать нельзя');
            $t = now();
            $sid = db_insert('connect_servers', ['name' => $name, 'owner_id' => $uid, 'invite' => rand_token(8), 'created_at' => $t]);
            db_insert('connect_members', ['server_id' => $sid, 'user_id' => $uid, 'role' => 'owner', 'joined_at' => $t]);
            db_insert('connect_channels', ['server_id' => $sid, 'name' => 'общий', 'pos' => 0, 'created_at' => $t]);
            json_out(['ok' => true, 'server' => ['id' => $sid, 'role' => 'owner']]);
        }
        case 'connect.server.join': {
            $u = require_user();
            $uid = (int)$u['id'];
            $code = in_str('invite', 40);
            $s = $code !== '' ? db_one('SELECT * FROM connect_servers WHERE invite = ?', [$code]) : null;
            if (!$s) fail('Приглашение не действует: проверь ссылку', 404);
            $sid = (int)$s['id'];
            if ($role = connect_role($sid, $uid)) json_out(['ok' => true, 'server' => ['id' => $sid, 'role' => $role], 'joined' => false]);
            if ((int)db_one('SELECT COUNT(*) c FROM connect_members WHERE server_id = ?', [$sid])['c'] >= CONNECT_MAX_MEMBERS) fail('На сервере уже максимум участников');
            db_insert('connect_members', ['server_id' => $sid, 'user_id' => $uid, 'role' => 'member', 'joined_at' => now()]);
            connect_mark_all_read($sid, $uid);
            json_out(['ok' => true, 'server' => ['id' => $sid, 'role' => 'member'], 'joined' => true]);
        }
        case 'connect.server.get': {
            $u = require_user();
            $uid = (int)$u['id'];
            $sid = in_int('id');
            $role = connect_need($sid, $uid);
            $s = db_one('SELECT * FROM connect_servers WHERE id = ?', [$sid]) ?? fail('Сервер не найден', 404);
            $channels = [];
            foreach (db_all('SELECT * FROM connect_channels WHERE server_id = ? ORDER BY pos, id', [$sid]) as $c) {
                $channels[] = ['id' => (int)$c['id'], 'name' => (string)$c['name'], 'unread' => connect_unread('c', (int)$c['id'], $uid)];
            }
            $members = array_map('connect_member_view', db_all('SELECT m.role, u.id, u.login, u.display_name, u.last_seen FROM connect_members m JOIN users u ON u.id = m.user_id WHERE m.server_id = ? LIMIT ' . CONNECT_MAX_MEMBERS, [$sid]));
            usort($members, fn($a, $b) => [CONNECT_RANK[$b['role']], $b['online'], $a['name']] <=> [CONNECT_RANK[$a['role']], $a['online'], $b['name']]);
            $canManage = CONNECT_RANK[$role] >= CONNECT_RANK['admin'];
            json_out(['ok' => true, 'server' => ['id' => $sid, 'name' => (string)$s['name'], 'role' => $role,
                'invite' => $canManage ? (string)$s['invite'] : null, 'ownerId' => (int)$s['owner_id']],
                'channels' => $channels, 'members' => $members]);
        }
        case 'connect.server.update': {
            $u = require_user();
            $sid = in_int('id');
            connect_need($sid, (int)$u['id'], 'admin');
            $name = connect_text(in_str('name', 80), 'Название сервера', 2, 64);
            db_exec('UPDATE connect_servers SET name = ? WHERE id = ?', [$name, $sid]);
            json_out(['ok' => true, 'name' => $name]);
        }
        case 'connect.server.invite': { // новая ссылка-приглашение, старая перестаёт работать
            $u = require_user();
            $sid = in_int('id');
            connect_need($sid, (int)$u['id'], 'admin');
            $code = rand_token(8);
            db_exec('UPDATE connect_servers SET invite = ? WHERE id = ?', [$code, $sid]);
            json_out(['ok' => true, 'invite' => $code]);
        }
        case 'connect.server.leave': {
            $u = require_user();
            $uid = (int)$u['id'];
            $sid = in_int('id');
            $role = connect_need($sid, $uid);
            if ($role === 'owner') fail('Владелец не может выйти: сначала удали сервер');
            db_exec('DELETE FROM connect_members WHERE server_id = ? AND user_id = ?', [$sid, $uid]);
            json_out(['ok' => true]);
        }
        case 'connect.server.delete': {
            $u = require_user();
            $sid = in_int('id');
            connect_need($sid, (int)$u['id'], 'owner');
            foreach (db_all('SELECT id FROM connect_channels WHERE server_id = ?', [$sid]) as $ch) connect_purge_channel((int)$ch['id']);
            db_exec('DELETE FROM connect_members WHERE server_id = ?', [$sid]);
            db_exec('DELETE FROM connect_servers WHERE id = ?', [$sid]);
            json_out(['ok' => true]);
        }

        // ---------- каналы ----------
        case 'connect.channel.create': {
            $u = require_user();
            $sid = in_int('server');
            connect_need($sid, (int)$u['id'], 'admin');
            $name = connect_channel_name(in_str('name', 40));
            $n = (int)db_one('SELECT COUNT(*) c FROM connect_channels WHERE server_id = ?', [$sid])['c'];
            if ($n >= CONNECT_MAX_CHANNELS) fail('На сервере уже максимум каналов');
            if (db_one('SELECT id FROM connect_channels WHERE server_id = ? AND name = ?', [$sid, $name])) fail('Канал с таким названием уже есть');
            $cid = db_insert('connect_channels', ['server_id' => $sid, 'name' => $name, 'pos' => $n, 'created_at' => now()]);
            json_out(['ok' => true, 'channel' => ['id' => $cid, 'name' => $name, 'unread' => 0]]);
        }
        case 'connect.channel.update': {
            $u = require_user();
            $sid = in_int('server');
            connect_need($sid, (int)$u['id'], 'admin');
            $cid = in_int('id');
            $name = connect_channel_name(in_str('name', 40));
            $ch = db_one('SELECT id FROM connect_channels WHERE id = ? AND server_id = ?', [$cid, $sid]) ?? fail('Такого канала нет', 404);
            if (db_one('SELECT id FROM connect_channels WHERE server_id = ? AND name = ? AND id <> ?', [$sid, $name, $cid])) fail('Канал с таким названием уже есть');
            db_exec('UPDATE connect_channels SET name = ? WHERE id = ?', [$name, (int)$ch['id']]);
            json_out(['ok' => true, 'name' => $name]);
        }
        case 'connect.channel.delete': {
            $u = require_user();
            $sid = in_int('server');
            connect_need($sid, (int)$u['id'], 'admin');
            $cid = in_int('id');
            $ch = db_one('SELECT id FROM connect_channels WHERE id = ? AND server_id = ?', [$cid, $sid]) ?? fail('Такого канала нет', 404);
            if ((int)db_one('SELECT COUNT(*) c FROM connect_channels WHERE server_id = ?', [$sid])['c'] <= 1) fail('На сервере должен остаться хотя бы один канал');
            connect_purge_channel((int)$ch['id']);
            json_out(['ok' => true]);
        }

        // ---------- участники ----------
        case 'connect.member.role': { // владелец назначает и снимает администраторов
            $u = require_user();
            $sid = in_int('server');
            connect_need($sid, (int)$u['id'], 'owner');
            $target = in_int('user');
            $role = in_str('role', 16);
            if (!in_array($role, ['admin', 'member'], true)) fail('Роль: администратор или участник');
            $cur = connect_role($sid, $target) ?? fail('Этого пользователя нет на сервере', 404);
            if ($cur === 'owner') fail('Роль владельца не меняется');
            db_exec('UPDATE connect_members SET role = ? WHERE server_id = ? AND user_id = ?', [$role, $sid, $target]);
            json_out(['ok' => true, 'role' => $role]);
        }
        case 'connect.member.kick': { // администратор исключает участников, владелец — кого угодно, кроме себя
            $u = require_user();
            $uid = (int)$u['id'];
            $sid = in_int('server');
            $myRole = connect_need($sid, $uid, 'admin');
            $target = in_int('user');
            if ($target === $uid) fail('Себя исключить нельзя: выйди с сервера');
            $cur = connect_role($sid, $target) ?? fail('Этого пользователя нет на сервере', 404);
            if ($cur === 'owner') fail('Владельца исключить нельзя');
            if ($cur === 'admin' && $myRole !== 'owner') fail('Администратора исключает только владелец', 403);
            db_exec('DELETE FROM connect_members WHERE server_id = ? AND user_id = ?', [$sid, $target]);
            json_out(['ok' => true]);
        }

        // ---------- личные сообщения (только с людьми, которые состоят с тобой на одном сервере) ----------
        case 'connect.dm.open': {
            $u = require_user();
            $uid = (int)$u['id'];
            $login = mb_strtolower(trim(in_str('login', 64)));
            if ($login === '') fail('Напиши ник пользователя');
            $p = db_one('SELECT id, login, display_name, last_seen FROM users WHERE login = ?', [$login]) ?? fail('Такого пользователя нет в StreOps', 404);
            $pid = (int)$p['id'];
            if ($pid === $uid) fail('Самому себе не пишут: открой «Заметки» на панели');
            $shared = db_one('SELECT a.server_id FROM connect_members a JOIN connect_members b ON b.server_id = a.server_id WHERE a.user_id = ? AND b.user_id = ? LIMIT 1', [$uid, $pid]);
            $existing = db_one('SELECT id FROM connect_dms WHERE a_id = ? AND b_id = ?', [min($uid, $pid), max($uid, $pid)]);
            if (!$shared && !$existing) fail('Писать можно только тем, с кем вы на одном сервере');
            $did = $existing ? (int)$existing['id'] : db_insert('connect_dms', ['a_id' => min($uid, $pid), 'b_id' => max($uid, $pid), 'created_at' => now()]);
            json_out(['ok' => true, 'dm' => ['id' => $did, 'peer' => ['id' => $pid, 'login' => (string)$p['login'], 'name' => connect_name($p), 'online' => connect_online($p)]]]);
        }

        // ---------- сообщения ----------
        case 'connect.messages': { // последние сообщения (или более ранние при before), печатающие и права
            $u = require_user();
            $uid = (int)$u['id'];
            $sc = connect_scope(in_str('scope', 1), in_int('id'), $uid);
            [$messages, $more] = connect_history($sc, $uid, in_int('before'));
            $out = ['ok' => true, 'messages' => $messages, 'hasMore' => $more, 'typing' => connect_typers($sc, $uid), 'manage' => $sc['manage']];
            if ($sc['scope'] === 'c') $out['channel'] = ['id' => (int)$sc['channel']['id'], 'name' => (string)$sc['channel']['name'], 'serverId' => $sc['serverId']];
            json_out($out);
        }
        case 'connect.send': {
            $u = require_user();
            $uid = (int)$u['id'];
            $sc = connect_scope(in_str('scope', 1), in_int('id'), $uid);
            $text = connect_text(in_str('text', CONNECT_MAX_TEXT + 1), 'Сообщение', 1, CONNECT_MAX_TEXT);
            connect_rate($uid);
            $reply = in_int('replyTo');
            if ($reply && !db_one('SELECT id FROM connect_messages WHERE id = ? AND scope = ? AND scope_id = ? AND deleted = 0', [$reply, $sc['scope'], $sc['id']])) $reply = 0;
            $mid = db_insert('connect_messages', ['scope' => $sc['scope'], 'scope_id' => $sc['id'], 'user_id' => $uid, 'text' => $text, 'reply_to' => $reply, 'deleted' => 0, 'created_at' => now(), 'edited_at' => 0]);
            connect_typing_set($sc, $uid, false);
            json_out(['ok' => true, 'message' => connect_views([connect_message($mid)], $uid)[0]]);
        }
        case 'connect.edit': { // править можно только своё
            $u = require_user();
            $uid = (int)$u['id'];
            $m = connect_message(in_int('id'));
            connect_scope((string)$m['scope'], (int)$m['scope_id'], $uid); // доступ к чату сохраняется, пока ты в нём
            if ((int)$m['user_id'] !== $uid) fail('Чужое сообщение не меняется', 403);
            if ((int)$m['deleted']) fail('Сообщение удалено', 404);
            $text = connect_text(in_str('text', CONNECT_MAX_TEXT + 1), 'Сообщение', 1, CONNECT_MAX_TEXT);
            db_exec('UPDATE connect_messages SET text = ?, edited_at = ? WHERE id = ?', [$text, now(), (int)$m['id']]);
            json_out(['ok' => true, 'message' => connect_views([connect_message((int)$m['id'])], $uid)[0]]);
        }
        case 'connect.delete': { // своё — всегда; чужое — администратор канала
            $u = require_user();
            $uid = (int)$u['id'];
            $m = connect_message(in_int('id'));
            connect_scope((string)$m['scope'], (int)$m['scope_id'], $uid);
            if ((int)$m['user_id'] !== $uid) {
                if ($m['scope'] !== 'c') fail('Чужое сообщение в личных сообщениях не удалить', 403);
                $ch = db_one('SELECT server_id FROM connect_channels WHERE id = ?', [(int)$m['scope_id']]);
                if (!$ch) fail('Такого канала нет', 404);
                if (CONNECT_RANK[connect_need((int)$ch['server_id'], $uid)] < CONNECT_RANK['admin']) fail('Нужна роль администратора', 403);
            }
            db_exec('DELETE FROM connect_reactions WHERE message_id = ?', [(int)$m['id']]);
            db_exec('UPDATE connect_messages SET deleted = 1, text = ? WHERE id = ?', ['', (int)$m['id']]);
            json_out(['ok' => true]);
        }
        case 'connect.react': { // реакция переключается: повторное нажатие её убирает
            $u = require_user();
            $uid = (int)$u['id'];
            $m = connect_message(in_int('id'));
            connect_scope((string)$m['scope'], (int)$m['scope_id'], $uid);
            if ((int)$m['deleted']) fail('Сообщение удалено', 404);
            $emoji = in_str('emoji', 16);
            if (!in_array($emoji, CONNECT_EMOJI, true)) fail('Такой реакции нет');
            $has = db_one('SELECT 1 x FROM connect_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', [(int)$m['id'], $uid, $emoji]);
            if ($has) db_exec('DELETE FROM connect_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', [(int)$m['id'], $uid, $emoji]);
            else db_insert('connect_reactions', ['message_id' => (int)$m['id'], 'user_id' => $uid, 'emoji' => $emoji]);
            json_out(['ok' => true, 'message' => connect_views([connect_message((int)$m['id'])], $uid)[0]]);
        }
        case 'connect.read': { // отмечаем чат прочитанным до последнего сообщения, которое видим
            $u = require_user();
            $uid = (int)$u['id'];
            $sc = connect_scope(in_str('scope', 1), in_int('id'), $uid);
            connect_set_read($sc['scope'], $sc['id'], $uid, in_int('last'));
            json_out(['ok' => true]);
        }
        case 'connect.search': {
            $u = require_user();
            $uid = (int)$u['id'];
            $sc = connect_scope(in_str('scope', 1), in_int('id'), $uid);
            $q = str_replace(['%', '_'], '', trim(in_str('q', 100)));
            if (mb_strlen($q) < 2) fail('Для поиска нужно хотя бы 2 символа');
            // регистр в кириллице SQLite не сравнивает, поэтому ищем по последним сообщениям чата средствами PHP
            $recent = db_all(CONNECT_MSG_SELECT . ' WHERE m.scope = ? AND m.scope_id = ? AND m.deleted = 0 ORDER BY m.id DESC LIMIT 1000', [$sc['scope'], $sc['id']]);
            $found = array_slice(array_values(array_filter($recent, fn($m) => mb_stripos((string)$m['text'], $q) !== false)), 0, 50);
            json_out(['ok' => true, 'messages' => connect_views(array_reverse($found), $uid)]);
        }
        case 'connect.typing': {
            $u = require_user();
            $uid = (int)$u['id'];
            $sc = connect_scope(in_str('scope', 1), in_int('id'), $uid);
            connect_typing_set($sc, $uid, in_bool('on', true));
            json_out(['ok' => true]);
        }
    }
    return false;
}

// Имя и ник пользователя для ответов API
function connect_user(array $u): array {
    return ['id' => (int)$u['id'], 'login' => (string)$u['login'], 'name' => connect_name($u)];
}
