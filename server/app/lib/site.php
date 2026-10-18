<?php
// Сайт стримера: настройка в стрим-панели («Мой сайт»), предложение видео, очередь, чат, модераторы, галочки, цвета ников,
// статус и просмотренное. Видимость сайта: стример включает сам, админ может заблокировать (kv site_block:{id}).

const SITE_SECTIONS = ['stream' => 'Стрим', 'offstream' => 'Не стрим'];
const SITE_HOSTS = ['youtube.com', 'youtu.be', 'twitch.tv', 'clips.twitch.tv'];
const SITE_COLORS = ['#F2F2F2', '#B4B4B4', '#FF6369', '#FFB020', '#5CD65C', '#4DA6FF', '#B57BFF'];

function site_defaults(): array {
    return ['enabled' => false, 'title' => '', 'status' => '', 'chatOn' => true, 'showFeed' => true, 'showWatched' => false, 'showStatus' => true];
}

function site_settings(int $uid): array {
    $s = settings_get($uid, 'site', []);
    return array_replace(site_defaults(), is_array($s) ? $s : []);
}

function site_streamer(string $login): ?array {
    return db_one('SELECT * FROM users WHERE login = ? AND banned = 0', [strtolower($login)]);
}

// Сайт виден посетителям, только если стример включил его и админ не заблокировал.
function site_active(array $streamer): bool {
    return site_settings((int)$streamer['id'])['enabled'] && !kv_get('site_block:' . (int)$streamer['id']);
}

function site_member(array $streamer, ?array $u): ?array {
    if ($u === null) return null;
    return db_one('SELECT * FROM site_members WHERE streamer_id = ? AND user_id = ?', [(int)$streamer['id'], (int)$u['id']]);
}

// owner — стример, mod — модератор сайта, null — посетитель.
function site_role(array $streamer, ?array $u): ?string {
    if ($u === null) return null;
    if ((int)$u['id'] === (int)$streamer['id']) return 'owner';
    $m = site_member($streamer, $u);
    return $m && (int)$m['is_mod'] ? 'mod' : null;
}

function site_can_moderate(array $streamer, ?array $u): bool {
    return in_array(site_role($streamer, $u), ['owner', 'mod'], true);
}

function site_need_owner(array $streamer, ?array $u): void {
    if (site_role($streamer, $u) !== 'owner') fail('Нет доступа', 403);
}

function site_video_row(array $v, array $names): array {
    return ['id' => (int)$v['id'], 'url' => $v['url'], 'title' => $v['title'] ?: $v['url'], 'section' => $v['section'],
        'status' => $v['status'], 'by' => $names[(int)$v['user_id']] ?? '', 'at' => (int)$v['created_at']];
}

function site_member_maps(int $streamerId): array {
    $out = [];
    foreach (db_all('SELECT user_id, is_mod, color, verified FROM site_members WHERE streamer_id = ?', [$streamerId]) as $m) {
        $out[(int)$m['user_id']] = ['mod' => (bool)$m['is_mod'], 'color' => $m['color'], 'verified' => (bool)$m['verified']];
    }
    return $out;
}

function site_badge_map(int $streamerId): array {
    $map = [];
    foreach (db_all('SELECT user_id, label, icon FROM site_badges WHERE streamer_id = ?', [$streamerId]) as $b) {
        $map[(int)$b['user_id']] = ['label' => $b['label'], 'icon' => $b['icon'] ?: mb_substr($b['label'], 0, 1)];
    }
    return $map;
}

function site_names(array $ids): array {
    $names = [];
    if (!$ids) return $names;
    $ph = implode(',', array_fill(0, count($ids), '?'));
    foreach (db_all("SELECT id, login, display_name FROM users WHERE id IN ($ph)", array_values($ids)) as $n) {
        $names[(int)$n['id']] = $n['display_name'] ?: $n['login'];
    }
    return $names;
}

function site_valid_url(string $url): bool {
    if (mb_strlen($url) > 400) return false;
    $p = parse_url($url);
    if (!$p || !in_array($p['scheme'] ?? '', ['https', 'http'], true)) return false;
    $host = strtolower(preg_replace('~^(www|m)\.~', '', $p['host'] ?? ''));
    return in_array($host, SITE_HOSTS, true);
}

function site_chat_item(array $c, array $members, array $badges): array {
    $m = $members[(int)$c['user_id']] ?? null;
    return ['id' => (int)$c['id'], 'userId' => (int)$c['user_id'], 'login' => $c['login'], 'name' => $c['name'], 'text' => $c['text'],
        'at' => (int)$c['created_at'], 'mod' => (bool)($m['mod'] ?? false), 'verified' => (bool)($m['verified'] ?? false),
        'color' => $m['color'] ?? '', 'badge' => $badges[(int)$c['user_id']] ?? null];
}

function site_dispatch(string $r): bool {
    switch ($r) {
        case 'site.get': { // публичная страница сайта
            $streamer = site_streamer(in_str('c', 40)) ?? fail('Такого сайта нет', 404);
            $u = current_user();
            $role = site_role($streamer, $u);
            $sid = (int)$streamer['id'];
            $st = site_settings($sid);
            $blocked = (bool)kv_get('site_block:' . $sid);
            $owner = $role === 'owner';
            if (!$owner && !site_active($streamer)) fail('Сайт выключен', 404);
            $members = site_member_maps($sid);
            $badges = site_badge_map($sid);
            $videos = db_all('SELECT * FROM site_videos WHERE streamer_id = ? AND status = ? ORDER BY id DESC LIMIT 60', [$sid, 'approved']);
            $names = site_names(array_unique(array_map(fn($v) => (int)$v['user_id'], $videos)));
            $chat = array_reverse(db_all('SELECT * FROM site_chat WHERE streamer_id = ? ORDER BY id DESC LIMIT 60', [$sid]));
            $stream = stream_row($sid);
            $watched = [];
            if ($st['showWatched'] || $owner) {
                $rows = db_all('SELECT * FROM site_watch WHERE streamer_id = ? ' . ($owner ? '' : 'AND public = 1 ') . 'ORDER BY id DESC LIMIT 100', [$sid]);
                $watched = array_map(fn($w) => ['id' => (int)$w['id'], 'url' => $w['url'], 'title' => $w['title'] ?: $w['url'], 'note' => $w['note'], 'public' => (bool)$w['public']], $rows);
            }
            $out = ['ok' => true, 'streamer' => ['login' => $streamer['login'], 'name' => $streamer['display_name'] ?: $streamer['login'],
                'avatar' => $streamer['avatar'], 'live' => $stream['live'], 'title' => $stream['title'], 'game' => $stream['game'], 'viewers' => $stream['viewers']],
                'site' => ['title' => $st['title'], 'status' => $st['showStatus'] ? $st['status'] : '', 'chatOn' => $st['chatOn'], 'showFeed' => $st['showFeed'],
                    'showWatched' => $st['showWatched']],
                'videos' => array_map(fn($v) => site_video_row($v, $names), $videos),
                'watched' => $watched,
                'chat' => array_map(fn($c) => site_chat_item($c, $members, $badges), $chat),
                'role' => $role, 'isOwner' => $owner, 'canModerate' => in_array($role, ['owner', 'mod'], true),
                'blocked' => $blocked, 'me' => $u ? user_public($u) : null, 'colors' => SITE_COLORS, 'sections' => SITE_SECTIONS];
            if (in_array($role, ['owner', 'mod'], true)) {
                $pending = db_all('SELECT * FROM site_videos WHERE streamer_id = ? AND status = ? ORDER BY id', [$sid, 'pending']);
                $pn = site_names(array_unique(array_map(fn($v) => (int)$v['user_id'], $pending)));
                $out['queue'] = array_map(fn($v) => site_video_row($v, $pn), $pending);
            }
            if (in_str('u', 40) !== '') {
                $p = db_one('SELECT * FROM users WHERE login = ?', [strtolower(in_str('u', 40))]);
                if ($p) {
                    $pid = (int)$p['id'];
                    $m = $members[$pid] ?? null;
                    $out['profile'] = ['login' => $p['login'], 'name' => $p['display_name'] ?: $p['login'], 'avatar' => $p['avatar'],
                        'badge' => $badges[$pid] ?? null, 'mod' => (bool)($m['mod'] ?? false), 'verified' => (bool)($m['verified'] ?? false), 'color' => $m['color'] ?? '',
                        'suggested' => (int)(db_one('SELECT COUNT(*) AS n FROM site_videos WHERE user_id = ? AND streamer_id = ?', [$pid, $sid])['n'] ?? 0),
                        'messages' => (int)(db_one('SELECT COUNT(*) AS n FROM site_chat WHERE user_id = ? AND streamer_id = ?', [$pid, $sid])['n'] ?? 0)];
                }
            }
            json_out($out);
        }
        case 'site.submit': {
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $streamer = site_streamer(in_str('c', 40)) ?? fail('Такого сайта нет', 404);
            if (!site_active($streamer)) fail('Сайт выключен', 404);
            if ((int)$streamer['id'] === (int)$u['id']) fail('Свои видео добавляй в «Мой сайт»');
            $url = in_str('url', 400);
            $section = in_str('section', 16, 'offstream');
            if (!site_valid_url($url)) fail('Нужна ссылка на YouTube или Twitch');
            if (!isset(SITE_SECTIONS[$section])) fail('Неизвестный раздел');
            $last = db_one('SELECT created_at FROM site_videos WHERE user_id = ? AND streamer_id = ? ORDER BY id DESC LIMIT 1', [(int)$u['id'], (int)$streamer['id']]);
            if ($last && now() - (int)$last['created_at'] < 86400) fail('Одно предложение в сутки на этот сайт');
            db_exec('INSERT INTO site_videos (streamer_id, user_id, url, title, section, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [(int)$streamer['id'], (int)$u['id'], $url, in_str('title', 200), $section, 'pending', now()]);
            json_out(['ok' => true, 'message' => 'Отправлено на одобрение']);
        }
        case 'site.review': { // одобрять могут стример и модераторы сайта
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $streamer = site_streamer(in_str('c', 40)) ?? fail('Такого сайта нет', 404);
            if (!site_can_moderate($streamer, $u)) fail('Нет доступа', 403);
            $action = in_str('action', 16);
            if (!in_array($action, ['approve', 'reject'], true)) fail('Неизвестное действие');
            db_exec('UPDATE site_videos SET status = ?, reviewed_at = ? WHERE id = ? AND streamer_id = ? AND status = ?',
                [$action === 'approve' ? 'approved' : 'rejected', now(), in_int('id'), (int)$streamer['id'], 'pending']);
            json_out(['ok' => true]);
        }
        case 'site.chat.send': {
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $streamer = site_streamer(in_str('c', 40)) ?? fail('Такого сайта нет', 404);
            if (!site_active($streamer)) fail('Сайт выключен', 404);
            if (!site_settings((int)$streamer['id'])['chatOn']) fail('Чат на сайте выключен');
            $text = in_str('text', 300);
            if ($text === '') fail('Пустое сообщение');
            $rateKey = 'sitechat:' . (int)$u['id'];
            if (kv_get($rateKey) !== null) fail('Не так часто, подожди пару секунд');
            kv_set($rateKey, 1, 3);
            db_exec('INSERT INTO site_chat (streamer_id, user_id, login, name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [(int)$streamer['id'], (int)$u['id'], $u['login'], $u['display_name'] ?: $u['login'], $text, now()]);
            json_out(['ok' => true]);
        }
        case 'site.chat.delete': { // удалять сообщения могут стример и модераторы
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $streamer = site_streamer(in_str('c', 40)) ?? fail('Такого сайта нет', 404);
            if (!site_can_moderate($streamer, $u)) fail('Нет доступа', 403);
            db_exec('DELETE FROM site_chat WHERE id = ? AND streamer_id = ?', [in_int('id'), (int)$streamer['id']]);
            json_out(['ok' => true]);
        }
        case 'site.manage': { // стрим-панель: всё для настройки сайта одним запросом (только владелец)
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $streamer = site_streamer((string)$u['login']) ?? fail('Нет канала', 404);
            site_need_owner($streamer, $u);
            $sid = (int)$streamer['id'];
            $members = db_all('SELECT m.*, u.login, u.display_name FROM site_members m JOIN users u ON u.id = m.user_id WHERE m.streamer_id = ? ORDER BY u.login', [$sid]);
            $watch = db_all('SELECT * FROM site_watch WHERE streamer_id = ? ORDER BY id DESC LIMIT 200', [$sid]);
            $chat = array_reverse(db_all('SELECT * FROM site_chat WHERE streamer_id = ? ORDER BY id DESC LIMIT 40', [$sid]));
            $pending = db_all('SELECT * FROM site_videos WHERE streamer_id = ? AND status = ? ORDER BY id', [$sid, 'pending']);
            $names = site_names(array_unique(array_map(fn($v) => (int)$v['user_id'], $pending)));
            $maps = site_member_maps($sid);
            $badges = site_badge_map($sid);
            json_out(['ok' => true, 'settings' => site_settings($sid), 'blocked' => (bool)kv_get('site_block:' . $sid), 'colors' => SITE_COLORS,
                'url' => 'site.html?c=' . rawurlencode($streamer['login']),
                'members' => array_map(fn($m) => ['login' => $m['login'], 'name' => $m['display_name'] ?: $m['login'], 'mod' => (bool)$m['is_mod'],
                    'verified' => (bool)$m['verified'], 'color' => $m['color'], 'userId' => (int)$m['user_id'], 'badge' => $badges[(int)$m['user_id']]['label'] ?? ''], $members),
                'watch' => array_map(fn($w) => ['id' => (int)$w['id'], 'url' => $w['url'], 'title' => $w['title'] ?: $w['url'], 'note' => $w['note'], 'public' => (bool)$w['public']], $watch),
                'chat' => array_map(fn($c) => site_chat_item($c, $maps, $badges), $chat),
                'queue' => array_map(fn($v) => site_video_row($v, $names), $pending)]);
        }
        case 'site.settings.save': {
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $streamer = site_streamer((string)$u['login']) ?? fail('Нет канала', 404);
            site_need_owner($streamer, $u);
            $sid = (int)$streamer['id'];
            $in = api_input();
            $cur = site_settings($sid);
            $flags = ['enabled', 'chatOn', 'showFeed', 'showWatched', 'showStatus'];
            foreach ($flags as $f) if (array_key_exists($f, $in)) $cur[$f] = (bool)$in[$f];
            if (array_key_exists('title', $in)) $cur['title'] = in_str('title', 80);
            if (array_key_exists('status', $in)) $cur['status'] = in_str('status', 120);
            if ($cur['enabled'] && kv_get('site_block:' . $sid)) fail('Сайт заблокирован администрацией StreOps');
            settings_set($sid, 'site', $cur);
            json_out(['ok' => true, 'settings' => $cur]);
        }
        case 'site.members.save': { // модераторы, галочки, цвет ника
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $streamer = site_streamer((string)$u['login']) ?? fail('Нет канала', 404);
            site_need_owner($streamer, $u);
            $sid = (int)$streamer['id'];
            $login = strtolower(in_str('login', 40));
            $viewer = db_one('SELECT id FROM users WHERE login = ?', [$login]) ?? fail('Такой зритель не заходил на StreOps');
            $vid = (int)$viewer['id'];
            if ($vid === $sid) fail('Стример и так владелец');
            $action = in_str('action', 16);
            if ($action === 'remove') {
                db_exec('DELETE FROM site_members WHERE streamer_id = ? AND user_id = ?', [$sid, $vid]);
                json_out(['ok' => true]);
            }
            $m = site_member($streamer, $viewer) ?? ['is_mod' => 0, 'color' => '', 'verified' => 0];
            $isMod = $action === 'mod' ? (int)in_bool('value') : (int)$m['is_mod'];
            $verified = $action === 'verified' ? (int)in_bool('value') : (int)$m['verified'];
            $color = $action === 'color' ? in_str('color', 16) : (string)$m['color'];
            if ($color !== '' && !in_array($color, SITE_COLORS, true)) fail('Нет такого цвета');
            db_exec('DELETE FROM site_members WHERE streamer_id = ? AND user_id = ?', [$sid, $vid]);
            db_exec('INSERT INTO site_members (streamer_id, user_id, is_mod, color, verified) VALUES (?, ?, ?, ?, ?)', [$sid, $vid, $isMod, $color, $verified]);
            json_out(['ok' => true]);
        }
        case 'site.watch.save': { // просмотренное: по умолчанию видно только стримеру
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $streamer = site_streamer((string)$u['login']) ?? fail('Нет канала', 404);
            site_need_owner($streamer, $u);
            $sid = (int)$streamer['id'];
            $id = in_int('id');
            $public = in_bool('public') ? 1 : 0;
            if ($id) {
                db_exec('UPDATE site_watch SET public = ?, note = ?, title = ? WHERE id = ? AND streamer_id = ?',
                    [$public, in_str('note', 300), in_str('title', 200), $id, $sid]);
            } else {
                $url = in_str('url', 400);
                if (!site_valid_url($url)) fail('Нужна ссылка на YouTube или Twitch');
                db_exec('INSERT INTO site_watch (streamer_id, url, title, note, public, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [$sid, $url, in_str('title', 200), in_str('note', 300), $public, now()]);
            }
            json_out(['ok' => true]);
        }
        case 'site.watch.delete': {
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $streamer = site_streamer((string)$u['login']) ?? fail('Нет канала', 404);
            site_need_owner($streamer, $u);
            db_exec('DELETE FROM site_watch WHERE id = ? AND streamer_id = ?', [in_int('id'), (int)$streamer['id']]);
            json_out(['ok' => true]);
        }
        case 'site.badge': { // значки-подписи: выдаёт только стример
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $streamer = site_streamer((string)$u['login']) ?? fail('Нет канала', 404);
            site_need_owner($streamer, $u);
            $viewer = db_one('SELECT id FROM users WHERE login = ?', [strtolower(in_str('login', 40))]) ?? fail('Такой зритель не заходил на StreOps');
            $label = in_str('label', 40);
            db_exec('DELETE FROM site_badges WHERE streamer_id = ? AND user_id = ?', [(int)$streamer['id'], (int)$viewer['id']]);
            if ($label !== '') {
                db_exec('INSERT INTO site_badges (streamer_id, user_id, label, icon) VALUES (?, ?, ?, ?)',
                    [(int)$streamer['id'], (int)$viewer['id'], $label, mb_strtoupper(mb_substr($label, 0, 1))]);
            }
            json_out(['ok' => true]);
        }
        case 'viewer.me': { // зритель-панель: мои предложения и сайты стримеров
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $rows = db_all('SELECT v.*, s.login AS streamer_login, s.display_name AS streamer_name FROM site_videos v JOIN users s ON s.id = v.streamer_id WHERE v.user_id = ? ORDER BY v.id DESC LIMIT 100', [(int)$u['id']]);
            $items = array_map(fn($v) => ['id' => (int)$v['id'], 'url' => $v['url'], 'title' => $v['title'] ?: $v['url'], 'section' => $v['section'],
                'status' => $v['status'], 'streamer' => $v['streamer_login'], 'streamerName' => $v['streamer_name'] ?: $v['streamer_login'], 'at' => (int)$v['created_at']], $rows);
            json_out(['ok' => true, 'user' => user_public($u), 'suggestions' => $items]);
        }
    }
    return false;
}
