<?php
// Сайт стримера (/site.html?c=ник) и зритель-панель: предложение видео, очередь одобрения, чат сайта, значки.

const SITE_SECTIONS = ['stream' => 'Стрим', 'offstream' => 'Не стрим'];
const SITE_HOSTS = ['youtube.com', 'youtu.be', 'twitch.tv', 'clips.twitch.tv'];

function site_streamer(string $login): ?array {
    return db_one('SELECT * FROM users WHERE login = ? AND banned = 0', [strtolower($login)]);
}

function site_is_owner(array $streamer, ?array $u): bool {
    return $u !== null && (int)$u['id'] === (int)$streamer['id'];
}

function site_video_row(array $v, array $names): array {
    return ['id' => (int)$v['id'], 'url' => $v['url'], 'title' => $v['title'] ?: $v['url'], 'section' => $v['section'],
        'status' => $v['status'], 'by' => $names[(int)$v['user_id']] ?? '', 'at' => (int)$v['created_at']];
}

function site_badge_map(int $streamerId): array {
    $map = [];
    foreach (db_all('SELECT user_id, label, icon FROM site_badges WHERE streamer_id = ?', [$streamerId]) as $b) {
        $map[(int)$b['user_id']] = ['label' => $b['label'], 'icon' => $b['icon'] ?: mb_substr($b['label'], 0, 1)];
    }
    return $map;
}

function site_valid_url(string $url): bool {
    if (mb_strlen($url) > 400) return false;
    $p = parse_url($url);
    if (!$p || !in_array($p['scheme'] ?? '', ['https', 'http'], true)) return false;
    $host = strtolower(preg_replace('~^(www|m)\.~', '', $p['host'] ?? ''));
    return in_array($host, SITE_HOSTS, true);
}

function site_dispatch(string $r): bool {
    switch ($r) {
        case 'site.get': {
            $streamer = site_streamer(in_str('c', 40));
            if (!$streamer) fail('Такого сайта нет', 404);
            $u = current_user();
            $owner = site_is_owner($streamer, $u);
            $names = [];
            foreach (db_all('SELECT id, login, display_name FROM users WHERE id IN (SELECT user_id FROM site_videos WHERE streamer_id = ?)', [(int)$streamer['id']]) as $n) {
                $names[(int)$n['id']] = $n['display_name'] ?: $n['login'];
            }
            $videos = array_map(fn($v) => site_video_row($v, $names), db_all(
                'SELECT * FROM site_videos WHERE streamer_id = ? AND status = ? ORDER BY id DESC LIMIT 60', [(int)$streamer['id'], 'approved']));
            $badges = site_badge_map((int)$streamer['id']);
            $chat = db_all('SELECT * FROM site_chat WHERE streamer_id = ? ORDER BY id DESC LIMIT 50', [(int)$streamer['id']]);
            $chat = array_map(fn($c) => ['id' => (int)$c['id'], 'login' => $c['login'], 'name' => $c['name'], 'text' => $c['text'],
                'at' => (int)$c['created_at'], 'badge' => $badges[(int)$c['user_id']] ?? null], array_reverse($chat));
            $stream = stream_row((int)$streamer['id']);
            $out = ['ok' => true, 'streamer' => ['login' => $streamer['login'], 'name' => $streamer['display_name'] ?: $streamer['login'],
                'avatar' => $streamer['avatar'], 'live' => $stream['live'], 'title' => $stream['title'], 'game' => $stream['game'], 'viewers' => $stream['viewers']],
                'videos' => $videos, 'chat' => $chat, 'isOwner' => $owner, 'me' => $u ? user_public($u) : null,
                'sections' => SITE_SECTIONS];
            if ($owner) {
                $out['queue'] = array_map(fn($v) => site_video_row($v, $names), db_all(
                    'SELECT * FROM site_videos WHERE streamer_id = ? AND status = ? ORDER BY id', [(int)$streamer['id'], 'pending']));
            }
            if (in_str('u', 40) !== '') {
                $p = site_streamer(in_str('u', 40)) ?? db_one('SELECT * FROM users WHERE login = ?', [strtolower(in_str('u', 40))]);
                if ($p) {
                    $out['profile'] = ['login' => $p['login'], 'name' => $p['display_name'] ?: $p['login'], 'avatar' => $p['avatar'],
                        'badge' => $badges[(int)$p['id']] ?? null,
                        'suggested' => (int)(db_one('SELECT COUNT(*) AS n FROM site_videos WHERE user_id = ? AND streamer_id = ?', [(int)$p['id'], (int)$streamer['id']])['n'] ?? 0),
                        'messages' => (int)(db_one('SELECT COUNT(*) AS n FROM site_chat WHERE user_id = ? AND streamer_id = ?', [(int)$p['id'], (int)$streamer['id']])['n'] ?? 0)];
                }
            }
            json_out($out);
        }
        case 'site.submit': {
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $streamer = site_streamer(in_str('c', 40)) ?? fail('Такого сайта нет', 404);
            if ((int)$streamer['id'] === (int)$u['id']) fail('Свои видео добавляй сам в панели');
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
        case 'site.review': {
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $streamer = site_streamer(in_str('c', 40)) ?? fail('Такого сайта нет', 404);
            if (!site_is_owner($streamer, $u)) fail('Нет доступа', 403);
            $action = in_str('action', 16);
            if (!in_array($action, ['approve', 'reject'], true)) fail('Неизвестное действие');
            db_exec('UPDATE site_videos SET status = ?, reviewed_at = ? WHERE id = ? AND streamer_id = ? AND status = ?',
                [$action === 'approve' ? 'approved' : 'rejected', now(), in_int('id'), (int)$streamer['id'], 'pending']);
            json_out(['ok' => true]);
        }
        case 'site.chat.send': {
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $streamer = site_streamer(in_str('c', 40)) ?? fail('Такого сайта нет', 404);
            $text = in_str('text', 300);
            if ($text === '') fail('Пустое сообщение');
            $rateKey = 'sitechat:' . (int)$u['id'];
            if (kv_get($rateKey) !== null) fail('Не так часто, подожди пару секунд');
            kv_set($rateKey, 1, 3);
            db_exec('INSERT INTO site_chat (streamer_id, user_id, login, name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [(int)$streamer['id'], (int)$u['id'], $u['login'], $u['display_name'] ?: $u['login'], $text, now()]);
            json_out(['ok' => true]);
        }
        case 'site.badge': { // значки выдаёт только стример; пустая подпись — снять значок
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $streamer = site_streamer(in_str('c', 40)) ?? fail('Такого сайта нет', 404);
            if (!site_is_owner($streamer, $u)) fail('Нет доступа', 403);
            $viewer = db_one('SELECT id FROM users WHERE login = ?', [strtolower(in_str('login', 40))]) ?? fail('Такой зритель не заходил на StreOps');
            $label = in_str('label', 40);
            if ($label === '') {
                db_exec('DELETE FROM site_badges WHERE streamer_id = ? AND user_id = ?', [(int)$streamer['id'], (int)$viewer['id']]);
            } else {
                db_exec('DELETE FROM site_badges WHERE streamer_id = ? AND user_id = ?', [(int)$streamer['id'], (int)$viewer['id']]);
                db_exec('INSERT INTO site_badges (streamer_id, user_id, label, icon) VALUES (?, ?, ?, ?)',
                    [(int)$streamer['id'], (int)$viewer['id'], $label, in_str('icon', 4)]);
            }
            json_out(['ok' => true]);
        }
        case 'viewer.me': { // зритель-панель: мои предложения и сайты стримеров, куда я предлагал видео
            $u = current_user() ?? fail('Войди через Twitch', 401);
            $rows = db_all('SELECT v.*, s.login AS streamer_login, s.display_name AS streamer_name FROM site_videos v JOIN users s ON s.id = v.streamer_id WHERE v.user_id = ? ORDER BY v.id DESC LIMIT 100', [(int)$u['id']]);
            $items = array_map(fn($v) => ['id' => (int)$v['id'], 'url' => $v['url'], 'title' => $v['title'] ?: $v['url'], 'section' => $v['section'],
                'status' => $v['status'], 'streamer' => $v['streamer_login'], 'streamerName' => $v['streamer_name'] ?: $v['streamer_login'], 'at' => (int)$v['created_at']], $rows);
            json_out(['ok' => true, 'user' => user_public($u), 'suggestions' => $items]);
        }
    }
    return false;
}
