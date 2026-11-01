<?php
// Плейлисты канала: свои подборки треков. Трек в плейлисте — песня с видео; у импортированного трека видео может появиться позже,
// когда импорт найдёт ролик. Плейлист ставится в очередь целиком или вперемешку и служит источником подбора (источник playlist).

const PL_MAX_LISTS = 50;   // плейлистов на канал
const PL_MAX_ITEMS = 500;  // треков в одном плейлисте
const PL_TITLE_MAX = 120;

function pl_row(array $p): array {
    return [
        'id' => (int)$p['id'], 'title' => (string)$p['title'], 'source' => (string)$p['source'],
        'items' => (int)($p['items'] ?? 0), 'ready' => (int)($p['ready'] ?? 0), 'updatedAt' => (int)$p['updated_at'],
    ];
}

// Плейлисты канала с количеством треков и готовых к проигрыванию
function pl_list(int $uid): array {
    $rows = db_all(
        'SELECT p.*, (SELECT COUNT(*) FROM music_playlist_items i WHERE i.playlist_id = p.id) AS items,
         (SELECT COUNT(*) FROM music_playlist_items i WHERE i.playlist_id = p.id AND i.status = ?) AS ready
         FROM music_playlists p WHERE p.user_id = ? ORDER BY p.id',
        ['ready', $uid]
    );
    return array_map('pl_row', $rows);
}

// Плейлист канала или отказ: чужой плейлист не открывается
function pl_get(int $uid, int $id): array {
    return db_one('SELECT * FROM music_playlists WHERE id = ? AND user_id = ?', [$id, $uid]) ?? fail('Плейлист не найден', 404);
}

function pl_title_ok(string $title): string {
    $t = trim(preg_replace('/\s+/u', ' ', $title));
    if ($t === '') fail('Назови плейлист');
    return mb_substr($t, 0, PL_TITLE_MAX);
}

// Новый плейлист. Возвращает id
function pl_create(int $uid, string $title, string $source = 'manual'): int {
    if ((int)db_one('SELECT COUNT(*) c FROM music_playlists WHERE user_id = ?', [$uid])['c'] >= PL_MAX_LISTS) {
        fail('Плейлистов не больше ' . PL_MAX_LISTS . '. Удали ненужные');
    }
    return db_insert('music_playlists', ['user_id' => $uid, 'title' => pl_title_ok($title), 'source' => $source, 'created_at' => now(), 'updated_at' => now()]);
}

function pl_rename(int $uid, int $id, string $title): void {
    pl_get($uid, $id);
    db_update('music_playlists', ['title' => pl_title_ok($title), 'updated_at' => now()], 'id = ?', [$id]);
}

function pl_delete(int $uid, int $id): void {
    pl_get($uid, $id);
    db_exec('DELETE FROM music_playlist_items WHERE playlist_id = ? AND user_id = ?', [$id, $uid]);
    db_exec('DELETE FROM music_playlists WHERE id = ? AND user_id = ?', [$id, $uid]);
}

// Треки плейлиста по порядку
function pl_items(int $uid, int $id): array {
    return array_map(fn($r) => [
        'id' => (int)$r['id'], 'pos' => (int)$r['pos'], 'artist' => (string)$r['artist'], 'track' => (string)$r['track'],
        'title' => (string)($r['title'] ?: trim($r['artist'] . ' — ' . $r['track'], ' —')), 'videoId' => (string)$r['video_id'],
        'duration' => (int)$r['duration'], 'status' => (string)$r['status'], 'query' => (string)$r['query'],
    ], db_all('SELECT * FROM music_playlist_items WHERE playlist_id = ? AND user_id = ? ORDER BY pos, id', [$id, $uid]));
}

function pl_next_pos(int $playlistId): int {
    return (int)(db_one('SELECT MAX(pos) m FROM music_playlist_items WHERE playlist_id = ?', [$playlistId])['m'] ?? 0) + 1;
}

// Видео по ссылке или по поиску — с проверкой так же, как у заказов: длительность, встраивание, стоп-слова
function pl_resolve(array $channel, string $input): array {
    if (!cfg('YOUTUBE_API_KEY')) fail('Музыка не настроена: нет ключа YouTube. Напиши в поддержку StreOps');
    $cfg = music_config((int)$channel['id']);
    $id = yt_parse_id($input);
    if ($id) {
        $v = yt_video($id) ?? fail('Видео по этой ссылке не нашлось на YouTube');
    } else {
        $ids = yt_search_items($input, 5);
        if ($ids === null) fail('Поиск на YouTube сейчас недоступен (лимит на сегодня или нет ключа). Вставь ссылку на видео');
        $det = yt_details(array_column($ids, 'id'));
        $v = null;
        foreach ($ids as $cand) {
            $d = $det[$cand['id']] ?? null;
            if ($d && !music_video_problem($cfg, $d)) { $v = $d; break; }
        }
        if (!$v) fail('Ничего подходящего по запросу «' . mb_substr($input, 0, 60) . '» не нашлось. Вставь ссылку на видео');
    }
    if ($p = music_video_problem($cfg, $v)) fail('Это видео не подходит: ' . $p['text']);
    return $v;
}

// Добавляем готовое видео в плейлист. Повтор того же видео не дублируем
function pl_add_video(int $uid, int $playlistId, array $v, string $query = ''): int {
    pl_get($uid, $playlistId);
    $dup = db_one('SELECT id FROM music_playlist_items WHERE playlist_id = ? AND video_id = ?', [$playlistId, $v['id']]);
    if ($dup) fail('Этот трек уже в плейлисте');
    if ((int)db_one('SELECT COUNT(*) c FROM music_playlist_items WHERE playlist_id = ?', [$playlistId])['c'] >= PL_MAX_ITEMS) {
        fail('В плейлисте не больше ' . PL_MAX_ITEMS . ' треков');
    }
    $p = music_split((string)$v['title']);
    return db_insert('music_playlist_items', [
        'playlist_id' => $playlistId, 'user_id' => $uid, 'pos' => pl_next_pos($playlistId), 'artist' => mb_substr($p['raw'], 0, 200),
        'track' => mb_substr($p['track'], 0, 300), 'title' => (string)$v['title'], 'query' => $query, 'video_id' => (string)$v['id'],
        'duration' => (int)$v['duration'], 'status' => 'ready', 'created_at' => now(), 'updated_at' => now(),
    ]);
}

function pl_item_remove(int $uid, int $playlistId, int $itemId): void {
    pl_get($uid, $playlistId);
    db_exec('DELETE FROM music_playlist_items WHERE id = ? AND playlist_id = ? AND user_id = ?', [$itemId, $playlistId, $uid]);
}

// Вверх или вниз: меняемся позицией с соседним треком
function pl_item_move(int $uid, int $playlistId, int $itemId, string $dir): void {
    pl_get($uid, $playlistId);
    $me = db_one('SELECT * FROM music_playlist_items WHERE id = ? AND playlist_id = ? AND user_id = ?', [$itemId, $playlistId, $uid]) ?? fail('Трек не найден', 404);
    $op = $dir === 'up' ? '<' : '>';
    $order = $dir === 'up' ? 'DESC' : 'ASC';
    $other = db_one("SELECT * FROM music_playlist_items WHERE playlist_id = ? AND user_id = ? AND (pos $op ? OR (pos = ? AND id $op ?)) ORDER BY pos $order, id $order LIMIT 1",
        [$playlistId, $uid, $me['pos'], $me['pos'], $itemId]);
    if (!$other) return;
    db_update('music_playlist_items', ['pos' => $other['pos']], 'id = ?', [$me['id']]);
    db_update('music_playlist_items', ['pos' => $me['pos']], 'id = ?', [$other['id']]);
}

// Ставим плейлист в очередь. mode: all — по порядку, shuffle — вперемешку. Уже стоящие в очереди видео пропускаем.
// Возвращает, сколько треков поставили. Лимитов «на зрителя» здесь нет: это решение стримера.
function pl_queue(array $user, int $playlistId, string $mode): int {
    $uid = (int)$user['id'];
    $pl = pl_get($uid, $playlistId);
    if (!plan_limits($user)['music']) fail('Музыка доступна на тарифе «Про» и выше');
    $items = array_values(array_filter(pl_items($uid, $playlistId), fn($i) => $i['videoId'] !== '' && $i['status'] === 'ready'));
    if ($mode === 'shuffle') shuffle($items);
    $queued = array_column(db_all("SELECT video_id FROM songs WHERE user_id = ? AND status IN ('queued','playing')", [$uid]), 'video_id');
    $pos = (int)(db_one("SELECT MAX(pos) m FROM songs WHERE user_id = ? AND status = 'queued'", [$uid])['m'] ?? 0);
    $added = 0;
    foreach ($items as $i) {
        if (in_array($i['videoId'], $queued, true)) continue;
        $pos++;
        db_insert('songs', [
            'user_id' => $uid, 'video_id' => $i['videoId'], 'url' => 'https://youtu.be/' . $i['videoId'], 'source' => 'YouTube',
            'title' => $i['title'], 'duration' => $i['duration'], 'requester' => 'плейлист · ' . mb_substr((string)$pl['title'], 0, 40),
            'method' => 'playlist', 'status' => 'queued', 'pos' => $pos, 'created_at' => now(),
        ]);
        $queued[] = $i['videoId'];
        $added++;
    }
    return $added;
}

// Треки плейлистов канала для подбора: готовые видео, которые давно не играли (mem — память канала)
function pl_auto_items(int $uid, array $recentVideoIds): array {
    $out = [];
    foreach (db_all("SELECT i.video_id, i.title, i.artist, i.track, i.duration, p.title AS pl FROM music_playlist_items i
        JOIN music_playlists p ON p.id = i.playlist_id WHERE i.user_id = ? AND i.status = 'ready' AND i.video_id <> '' ORDER BY i.id", [$uid]) as $r) {
        if (in_array((string)$r['video_id'], $recentVideoIds, true)) continue;
        $out[] = ['id' => (string)$r['video_id'], 'title' => (string)$r['title'], 'duration' => (int)$r['duration'], 'pl' => (string)$r['pl']];
    }
    return $out;
}

// Импорт: строка импорта решена — пишем видео в элемент плейлиста. Строка без видео остаётся ждать, с причиной — missing.
function pl_sync_import_item(int $importItemId, ?array $v, string $status): void {
    if ($importItemId <= 0) return;
    if ($v && $status === 'ready') {
        db_exec("UPDATE music_playlist_items SET video_id = ?, title = ?, duration = ?, status = 'ready', updated_at = ? WHERE import_item_id = ?",
            [(string)$v['id'], mb_substr((string)$v['title'], 0, 300), (int)$v['duration'], now(), $importItemId]);
    } elseif ($status === 'missing') {
        db_exec("UPDATE music_playlist_items SET status = 'missing', updated_at = ? WHERE import_item_id = ? AND video_id = ''", [now(), $importItemId]);
    }
}

// Строка импорта становится элементом плейлиста. Видео известно — ждёт проверки (станет готовым после поиска),
// недоступное на YouTube сразу отмечаем, чтобы его можно было заменить ссылкой
function pl_import_row(int $playlistId, int $uid, int $importItemId, array $it, int $pos): void {
    db_insert('music_playlist_items', [
        'playlist_id' => $playlistId, 'user_id' => $uid, 'pos' => $pos, 'artist' => mb_substr((string)$it['artist'], 0, 200),
        'track' => mb_substr((string)$it['track'], 0, 300), 'title' => mb_substr((string)($it['video_title'] ?? ''), 0, 300),
        'query' => (string)$it['query'], 'video_id' => (string)$it['video_id'], 'duration' => 0,
        'status' => !empty($it['unavailable']) ? 'missing' : 'pending', 'import_item_id' => $importItemId,
        'created_at' => now(), 'updated_at' => now(),
    ]);
}
