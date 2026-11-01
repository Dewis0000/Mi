<?php
// Маршруты музыки: лайки и дизлайки, плейлисты, своя музыка для запасного плеера, права помощников на импорт.
// api_dispatch вызывает music_api() первым: неизвестный маршрут возвращается, дальше идёт api.php.

// Чей канал трогаем. Свой — всегда. Чужой — администратор сайта или помощник канала с нужным правом.
// $need: music — управление музыкой (помощник по умолчанию); import — импорт плейлистов и загрузка своих файлов.
function music_scope(array $u, string $channelLogin, string $need = 'music'): array {
    $login = mb_strtolower(trim($channelLogin));
    $me = mb_strtolower((string)$u['login']);
    if ($login === '' || $login === $me) return $u;
    $ch = db_one('SELECT * FROM users WHERE login = ?', [$login]) ?? fail('Канал не найден', 404);
    if (is_admin($u)) return $ch;
    if (!in_array($me, mgr_list((int)$ch['id']), true)) fail('Ты не помощник этого канала', 403);
    if ($need === 'import' && !mgr_can((int)$ch['id'], $me, 'import')) {
        fail('Стример не дал тебе права импортировать плейлисты и загружать музыку', 403);
    }
    return $ch;
}

// Права помощника в канале: хранятся у канала, по логину помощника. Пока ничего не выдано — прав нет.
function mgr_perms(int $uid, string $login): array {
    $all = settings_get($uid, 'manager_perms', []);
    $mine = is_array($all) && is_array($all[$login] ?? null) ? $all[$login] : [];
    return ['import' => !empty($mine['import'])];
}

function mgr_can(int $uid, string $login, string $perm): bool {
    return !empty(mgr_perms($uid, $login)[$perm]);
}

// Плейлисты и своя музыка — функции тарифа с музыкой. Проверяем по каналу, а не по тому, кто нажал.
function music_plan_ok(array $ch): void {
    if (!plan_limits($ch)['music']) fail('Плейлисты и своя музыка доступны на тарифе «Про» и выше');
}

// Журнал для помощника: кто и что сделал с музыкой канала
function music_log_manager(array $ch, array $u, string $action, string $detail): void {
    if ((int)$ch['id'] !== (int)$u['id']) mgr_log($ch, mb_strtolower((string)$u['login']), $action, $detail);
}

// Строка очереди для плеера: песня и, если такой файл есть в «Моей музыке», его адрес — играем файлом без YouTube
function song_play_row(array $u, array $song): array {
    $row = song_row($song);
    $lib = lib_match((int)$u['id'], (string)$song['title']);
    $row['audio'] = $lib ? lib_view($u, $lib) : null;
    return $row;
}

function music_api(string $r): void {
    switch ($r) {
        case 'music.feedback': { // лайк / дизлайк / снять голос стримера или помощника
            $u = require_user();
            $ch = music_scope($u, in_str('channel', 40), 'music');
            $kind = in_str('kind', 8) === 'artist' ? 'artist' : 'track';
            $value = max(-1, min(1, in_int('value')));
            fb_act($ch, $kind, in_int('id'), $value, mb_strtolower((string)$u['login']));
            music_log_manager($ch, $u, 'feedback', ($value > 0 ? 'лайк' : ($value < 0 ? 'дизлайк' : 'голос снят')) . ' ' . $kind . ' #' . in_int('id'));
            json_out(['ok' => true]);
        }

        case 'playlists.list': {
            $u = require_user();
            $ch = music_scope($u, in_str('channel', 40), 'music');
            json_out(['ok' => true, 'items' => pl_list((int)$ch['id']), 'allowed' => (bool)plan_limits($ch)['music'], 'max' => PL_MAX_LISTS]);
        }
        case 'playlists.create': {
            $u = require_user();
            $ch = music_scope($u, in_str('channel', 40), 'music');
            music_plan_ok($ch);
            $id = pl_create((int)$ch['id'], in_str('title', 200), 'manual');
            music_log_manager($ch, $u, 'playlist', 'создан плейлист #' . $id);
            json_out(['ok' => true, 'id' => $id]);
        }
        case 'playlists.rename': {
            $u = require_user();
            $ch = music_scope($u, in_str('channel', 40), 'music');
            pl_rename((int)$ch['id'], in_int('id'), in_str('title', 200));
            json_out(['ok' => true]);
        }
        case 'playlists.delete': {
            $u = require_user();
            $ch = music_scope($u, in_str('channel', 40), 'music');
            pl_delete((int)$ch['id'], in_int('id'));
            music_log_manager($ch, $u, 'playlist', 'удалён плейлист #' . in_int('id'));
            json_out(['ok' => true]);
        }
        case 'playlists.get': {
            $u = require_user();
            $ch = music_scope($u, in_str('channel', 40), 'music');
            $p = pl_get((int)$ch['id'], in_int('id'));
            json_out(['ok' => true, 'playlist' => pl_row($p), 'items' => pl_items((int)$ch['id'], (int)$p['id'])]);
        }
        case 'playlists.add': { // трек в плейлист: ссылка на YouTube или поиск по названию
            $u = require_user();
            $ch = music_scope($u, in_str('channel', 40), 'music');
            music_plan_ok($ch);
            $pid = in_int('id');
            pl_get((int)$ch['id'], $pid);
            $v = pl_resolve($ch, in_str('query', 300));
            pl_add_video((int)$ch['id'], $pid, $v, in_str('query', 300));
            music_log_manager($ch, $u, 'playlist', 'в плейлист #' . $pid . ' добавлен «' . mb_substr((string)$v['title'], 0, 60) . '»');
            json_out(['ok' => true, 'title' => $v['title'], 'items' => pl_items((int)$ch['id'], $pid)]);
        }
        case 'playlists.remove': {
            $u = require_user();
            $ch = music_scope($u, in_str('channel', 40), 'music');
            pl_item_remove((int)$ch['id'], in_int('id'), in_int('itemId'));
            json_out(['ok' => true, 'items' => pl_items((int)$ch['id'], in_int('id'))]);
        }
        case 'playlists.move': {
            $u = require_user();
            $ch = music_scope($u, in_str('channel', 40), 'music');
            $dir = in_str('dir', 4) === 'up' ? 'up' : 'down';
            pl_item_move((int)$ch['id'], in_int('id'), in_int('itemId'), $dir);
            json_out(['ok' => true, 'items' => pl_items((int)$ch['id'], in_int('id'))]);
        }
        case 'playlists.queue': { // весь плейлист в очередь: по порядку или вперемешку
            $u = require_user();
            $ch = music_scope($u, in_str('channel', 40), 'music');
            $n = pl_queue($ch, in_int('id'), in_str('mode', 8) === 'shuffle' ? 'shuffle' : 'all');
            music_log_manager($ch, $u, 'playlist', 'в очередь поставлено ' . $n . ' из плейлиста #' . in_int('id'));
            json_out(['ok' => true, 'added' => $n]);
        }

        case 'library.list': {
            $u = require_user();
            $ch = music_scope($u, in_str('channel', 40), 'music');
            json_out(['ok' => true, 'items' => lib_list((int)$ch['id']), 'used' => lib_used((int)$ch['id']), 'quota' => lib_quota($ch),
                'max' => LIB_MAX_FILE, 'formats' => array_keys(LIB_EXT), 'allowed' => (bool)plan_limits($ch)['music']]);
        }
        case 'library.upload': { // multipart: файл в поле file, название и длительность — обычными полями
            $u = require_user();
            $ch = music_scope($u, in_str('channel', 40), 'import');
            music_plan_ok($ch);
            $title = trim((string)($_POST['title'] ?? ''));
            $id = lib_store($ch, $_FILES['file'] ?? [], $title, (int)($_POST['duration'] ?? 0), mb_strtolower((string)$u['login']));
            music_log_manager($ch, $u, 'library', 'загружен файл «' . mb_substr($title !== '' ? $title : 'без названия', 0, 60) . '»');
            json_out(['ok' => true, 'id' => $id, 'items' => lib_list((int)$ch['id']), 'used' => lib_used((int)$ch['id'])]);
        }
        case 'library.delete': {
            $u = require_user();
            $ch = music_scope($u, in_str('channel', 40), 'import');
            lib_delete((int)$ch['id'], in_int('id'));
            music_log_manager($ch, $u, 'library', 'удалён файл #' . in_int('id'));
            json_out(['ok' => true, 'items' => lib_list((int)$ch['id']), 'used' => lib_used((int)$ch['id'])]);
        }

        case 'player.filler': { // плеер в OBS: запасной трек, когда YouTube не открывается и своей музыки под трек нет
            $p = db_one('SELECT * FROM users WHERE widget_token = ?', [in_str('t', 64)]);
            if (!$p || (int)$p['banned']) fail('Плеер не найден', 404);
            $pick = lib_filler($p);
            json_out(['ok' => true, 'track' => $pick ? lib_view($p, $pick) : null]);
        }

        case 'mods.perm': { // право помощника импортировать плейлисты и загружать свою музыку
            $u = require_user();
            $login = mb_strtolower(trim(in_str('login', 40), " @\t"));
            $perm = in_str('perm', 16);
            if ($perm !== 'import') fail('Нет такого права');
            if (!in_array($login, mgr_list((int)$u['id']), true)) fail('Такого помощника нет в списке');
            $all = settings_get((int)$u['id'], 'manager_perms', []);
            $all = is_array($all) ? $all : [];
            $all[$login][$perm] = in_bool('on');
            settings_set((int)$u['id'], 'manager_perms', $all);
            json_out(['ok' => true, 'perms' => mgr_perms((int)$u['id'], $login)]);
        }

        default:
            return;
    }
}
