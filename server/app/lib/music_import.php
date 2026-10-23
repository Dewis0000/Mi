<?php
// Импорт плейлистов. Ссылка (YouTube, Deezer, Apple Music) или список треков текстом (Яндекс, Spotify, VK и любой другой сервис).
// По каждому треку стример видит, что с ним: добавлен, не добавлен и почему, нужно проверить, или ещё ищем.
// Поиск на YouTube стоит квоты, поэтому треки без готового видео ищутся по мере суточного лимита, по порядку плейлиста.

const MI_MAX_ITEMS = 200;  // больше треков за один импорт не берём
const MI_STEP = 40;        // сколько строк обрабатываем за один проход
const MI_RECENT_DAYS = 60; // тот же трек не ставим чаще, чем раз в 60 дней (как в автоподборе)

// Причины, которые не приходят из music_video_problem (его тексты берутся оттуда)
const MI_REASON_TEXT = [
    'not_found' => 'Не нашли на YouTube. Вставь ссылку на нужное видео — трек добавится.',
    'unavailable' => 'Видео удалено или закрыто на YouTube.',
    'queued' => 'Уже стоит в очереди.',
    'dup' => 'Такой трек уже добавлен из этого списка.',
    'recent' => 'Играл за последние 60 дней. Нажми «Добавить всё равно», если нужен.',
    'budget' => 'Ждём: на сегодня исчерпан лимит поиска YouTube. Продолжим завтра — или вставь ссылку на видео.',
    'error' => 'Ошибка YouTube. Попробуем ещё раз.',
    'cancelled' => 'Импорт отменён до этого трека.',
    'replaced' => 'Список заменили новым импортом. Вставь его снова, если нужен.',
];

// Что за ввод: одна ссылка без пробелов — плейлист или ролик; всё остальное — список треков текстом
function mi_source(string $input): array {
    $input = trim($input);
    if (!preg_match('~^https?://\S+$~i', $input)) return ['source' => 'text'];
    $host = preg_replace('~^(www|m)\.~', '', strtolower((string)parse_url($input, PHP_URL_HOST)));
    parse_str((string)parse_url($input, PHP_URL_QUERY), $q);
    if (in_array($host, ['youtube.com', 'music.youtube.com', 'youtu.be'], true)) {
        if (!empty($q['list'])) return ['source' => 'youtube', 'id' => (string)$q['list']];
        if ($vid = yt_parse_id($input)) return ['source' => 'video', 'id' => $vid];
    }
    if (preg_match('~(^|\.)deezer\.com$~', $host) && preg_match('~/playlist/(\d+)~', $input, $m)) return ['source' => 'deezer', 'id' => $m[1]];
    if ($host === 'music.apple.com' && str_contains($input, '/playlist/')) return ['source' => 'apple', 'url' => $input];
    return ['source' => 'unsupported', 'host' => $host];
}

// Название сервиса для сообщений: Яндекс, Spotify, VK и другие
function mi_service_name(string $host): string {
    return match (true) {
        str_contains($host, 'yandex') => 'Яндекс Музыку',
        str_contains($host, 'spotify') => 'Spotify',
        str_contains($host, 'vk.') || $host === 'vk.com' => 'VK Музыку',
        str_contains($host, 'soundcloud') => 'SoundCloud',
        str_contains($host, 'zvuk') => 'Звук',
        default => $host !== '' ? $host : 'этот сервис',
    };
}

// Один трек: исполнитель и название как в списке, запрос для поиска; для видео — уже известный ролик
function mi_item(string $artist, string $track, string $videoId = '', string $videoTitle = ''): array {
    $artist = trim($artist);
    $track = trim($track);
    return ['artist' => $artist, 'track' => $track, 'query' => trim($artist . ' ' . $track), 'video_id' => $videoId, 'video_title' => $videoTitle];
}

// Список текстом: по одному треку на строку, с номером или без. Строка-ссылка на YouTube — готовое видео.
function mi_text_items(string $text): array {
    $out = [];
    foreach (preg_split('~\R~u', $text) as $line) {
        $line = trim($line);
        if ($line === '') continue;
        if (preg_match('~^https?://\S+$~i', $line) && ($vid = yt_parse_id($line))) {
            $out[] = mi_item('', $line, $vid, '');
        } else {
            $line = preg_replace('~^\s*\d{1,3}\s*[.)]\s*~u', '', $line);
            $line = preg_replace('~^[\s\-–—•]+|[\s\-–—•]+$~u', '', $line);
            if ($line === '') continue;
            if (preg_match('~^(.+?)\s+[-–—]\s+(.+)$~u', $line, $m)) $out[] = mi_item($m[1], $m[2]);
            else $out[] = mi_item('', $line);
        }
        if (count($out) >= MI_MAX_ITEMS) break;
    }
    return $out;
}

// Плейлист Deezer: открытый API, без ключа, по 100 треков на страницу
function mi_fetch_deezer(string $pid): array {
    $r = http_request('GET', 'https://api.deezer.com/playlist/' . $pid);
    if ($r['code'] !== 200 || !isset($r['json']['id'])) fail('Плейлист Deezer не открылся: он закрыт или ссылка неверная');
    $items = [];
    $url = 'https://api.deezer.com/playlist/' . $pid . '/tracks?limit=100';
    while ($url && count($items) < MI_MAX_ITEMS) {
        $p = http_request('GET', $url);
        if ($p['code'] !== 200) break;
        foreach ($p['json']['data'] ?? [] as $tr) $items[] = mi_item((string)($tr['artist']['name'] ?? ''), (string)($tr['title'] ?? ''));
        $url = $p['json']['next'] ?? null;
    }
    return ['title' => (string)($r['json']['title'] ?? ''), 'items' => array_slice($items, 0, MI_MAX_ITEMS), 'total' => (int)($r['json']['nb_tracks'] ?? count($items))];
}

// Плейлист Apple Music: список лежит в JSON-LD страницы, но только названия и не больше 50 треков
function mi_fetch_apple(string $url): array {
    $r = http_request('GET', $url, ['Accept-Language' => 'en'], null, 10);
    if ($r['code'] !== 200) fail('Плейлист Apple Music не открылся: он закрыт или ссылка неверная');
    preg_match_all('~<script[^>]*ld\+json[^>]*>(.*?)</script>~s', (string)$r['raw'], $all);
    foreach ($all[1] as $js) {
        $d = json_decode($js, true);
        if (!is_array($d) || ($d['@type'] ?? '') !== 'MusicPlaylist') continue;
        $items = [];
        foreach ($d['track'] ?? [] as $tr) $items[] = mi_item('', (string)($tr['name'] ?? ''));
        return ['title' => (string)($d['name'] ?? ''), 'items' => array_slice($items, 0, MI_MAX_ITEMS), 'total' => (int)($d['numTracks'] ?? count($items))];
    }
    fail('Apple Music не отдал список треков: вставь названия текстом');
}

// Создаём импорт и сразу обрабатываем первые строки (ссылки на видео ставятся без поиска)
function music_import_create(array $user, string $input): array {
    $uid = (int)$user['id'];
    $src = mi_source($input);
    if ($src['source'] === 'unsupported') {
        fail('Ссылку на ' . mi_service_name($src['host']) . ' мы не читаем: без входа там не отдают список треков. Скопируй названия и вставь текстом, по одному треку на строку, например «Кино — Группа крови»');
    }
    $title = '';
    $note = '';
    if ($src['source'] === 'youtube') {
        $pl = yt_playlist($src['id'], MI_MAX_ITEMS) ?? fail('Плейлист YouTube не открылся: ссылка неверная, плейлист закрыт или не задан ключ YouTube');
        $title = $pl['title'];
        $items = [];
        foreach ($pl['items'] as $x) {
            $it = mi_item('', $x['unavailable'] ? 'Видео удалено или закрыто' : $x['title'], $x['video_id'], $x['unavailable'] ? '' : $x['title']);
            $it['unavailable'] = $x['unavailable'];
            $items[] = $it;
        }
        if ($pl['total'] > count($items)) $note = 'Взяли первые ' . count($items) . ' из ' . $pl['total'] . ' треков';
    } elseif ($src['source'] === 'video') {
        $items = [mi_item('', $input, $src['id'], '')];
        $title = 'Одно видео';
    } elseif ($src['source'] === 'deezer') {
        $d = mi_fetch_deezer($src['id']);
        [$title, $items] = [$d['title'], $d['items']];
        if ($d['total'] > count($items)) $note = 'Взяли первые ' . count($items) . ' из ' . $d['total'] . ' треков';
    } elseif ($src['source'] === 'apple') {
        $a = mi_fetch_apple($src['url']);
        [$title, $items] = [$a['title'], $a['items']];
        if ($a['total'] > count($items)) $note = 'Apple Music отдал ' . count($items) . ' из ' . $a['total'] . ' треков — остальные вставь текстом. ';
        $note .= 'У Apple Music известны только названия: исполнителя проверь вручную.';
    } else {
        $items = mi_text_items($input);
        $title = 'Список треков';
    }
    if (!$items) fail('В списке не нашлось треков');
    // один активный импорт: новый заменяет незаконченный, его оставшиеся треки не ставим
    db_exec("UPDATE music_import_items SET status = 'skipped', reason = 'replaced', info = ?, updated_at = ? WHERE user_id = ? AND status = 'queued' AND import_id IN (SELECT id FROM music_imports WHERE user_id = ? AND status = 'running')",
        [MI_REASON_TEXT['replaced'], now(), $uid, $uid]);
    db_exec("UPDATE music_imports SET status = 'replaced', updated_at = ? WHERE user_id = ? AND status = 'running'", [now(), $uid]);
    $imp = db_insert('music_imports', [
        'user_id' => $uid, 'source' => $src['source'], 'title' => mb_substr((string)$title, 0, 200), 'source_url' => $src['source'] === 'text' ? '' : $input,
        'note' => $note, 'status' => 'running', 'created_at' => now(), 'updated_at' => now(),
    ]);
    foreach ($items as $i => $it) {
        $row = [
            'import_id' => $imp, 'user_id' => $uid, 'pos' => $i + 1, 'artist' => mb_substr($it['artist'], 0, 200), 'track' => mb_substr($it['track'], 0, 300),
            'query' => $it['query'], 'video_id' => $it['video_id'], 'video_title' => $it['video_title'], 'status' => 'queued', 'updated_at' => now(),
        ];
        if (!empty($it['unavailable'])) $row += ['status' => 'skipped', 'reason' => 'unavailable', 'info' => MI_REASON_TEXT['unavailable']];
        db_insert('music_import_items', $row);
    }
    music_import_step($user, $imp, MI_STEP);
    return ['id' => $imp];
}

// Что уже стоит в очереди, что уже добавлено из этого импорта и что играло недавно — по видео и по песне (ключ песни)
function mi_context(int $uid, int $importId): array {
    $q = [];
    foreach (db_all("SELECT video_id FROM songs WHERE user_id = ? AND status IN ('queued','playing','pending')", [$uid]) as $r) $q[(string)$r['video_id']] = true;
    $recent = [];
    foreach (db_all("SELECT title, video_id FROM songs WHERE user_id = ? AND status = 'played' AND played_at >= ? ORDER BY id DESC LIMIT 3000", [$uid, now() - MI_RECENT_DAYS * 86400]) as $s) {
        $recent['v:' . $s['video_id']] = true;
        $recent['k:' . music_split((string)$s['title'])['key']] = true;
    }
    $imported = [];
    foreach (db_all("SELECT video_id, video_title FROM music_import_items WHERE import_id = ? AND status = 'added'", [$importId]) as $s) {
        $imported['v:' . $s['video_id']] = true;
        $imported['k:' . music_split((string)$s['video_title'])['key']] = true;
    }
    return ['q' => $q, 'r' => $recent, 'i' => $imported];
}

// Нормализованные слова названия (для сравнения с выдачей YouTube)
function mi_tokens(string $s): array {
    $n = music_norm($s);
    return $n === '' ? [] : array_values(array_unique(explode(' ', $n)));
}

// Доля слов запроса, которые есть в названии кандидата
function mi_cover(array $need, array $have): float {
    if (!$need) return 1.0;
    $set = array_flip($have);
    $hit = 0;
    foreach ($need as $t) if (isset($set[$t])) $hit++;
    return $hit / count($need);
}

// Кандидаты из выдачи: strong — уверенные совпадения по порядку выдачи (до трёх: если первое закрыто или это трансляция,
// берём следующее), unsure — лучший похожий вариант без уверенности. Без исполнителя уверенного совпадения не бывает:
// один и тот же заголовок есть у каверов.
function mi_pick_from(array $item, array $cands): array {
    $artist = mi_tokens($item['artist']);
    $track = mi_tokens($item['track']);
    $all = array_merge($artist, $track);
    $strong = [];
    $unsure = null;
    foreach ($cands as $c) {
        $have = array_merge(mi_tokens($c['title']), mi_tokens($c['channel']));
        $tc = mi_cover($track, $have);
        $ac = mi_cover($artist, $have);
        $ca = mi_cover($all, $have);
        if ($artist && (($tc >= 0.8 && $ac >= 0.8) || $ca >= 0.9)) {
            if (count($strong) < 3) $strong[] = $c;
            continue;
        }
        $weak = $artist ? ($tc >= 0.6 && $ac >= 0.5) || $ca >= 0.7 : $tc >= 0.8;
        if ($weak && !$unsure) $unsure = $c;
    }
    return ['strong' => $strong, 'unsure' => $unsure];
}

// Решение по одному видео: ставим в очередь или не добавляем и почему. Чистая функция: все данные приходят аргументами.
// $v — детали видео (null — видео не найдено), $force — игнорировать «играл недавно».
function mi_decide(?array $v, string $videoId, array $ctx, array $cfg, bool $force): array {
    if (!$v) return ['status' => 'skipped', 'reason' => 'unavailable', 'info' => MI_REASON_TEXT['unavailable']];
    if ($p = music_video_problem($cfg, $v)) return ['status' => 'skipped', 'reason' => $p['code'], 'info' => $p['text']];
    $key = music_split($v['title'])['key'];
    if (isset($ctx['q'][$videoId])) return ['status' => 'skipped', 'reason' => 'queued', 'info' => MI_REASON_TEXT['queued']];
    if (isset($ctx['i']['v:' . $videoId]) || isset($ctx['i']['k:' . $key])) return ['status' => 'skipped', 'reason' => 'dup', 'info' => MI_REASON_TEXT['dup']];
    if (!$force && (isset($ctx['r']['v:' . $videoId]) || isset($ctx['r']['k:' . $key]))) {
        return ['status' => 'skipped', 'reason' => 'recent', 'info' => MI_REASON_TEXT['recent']];
    }
    return ['status' => 'added', 'reason' => '', 'info' => ''];
}

// Из уверенных кандидатов берём первый, который можно поставить; если ни один не подходит — причина первого
function mi_choose_candidate(array $vids, array $det, array $ctx, array $cfg, bool $force = false): array {
    $first = null;
    $recent = null;
    foreach ($vids as $vid) {
        $v = $det[$vid] ?? null;
        $d = mi_decide($v, $vid, $ctx, $cfg, $force);
        if ($first === null) $first = [$vid, $v, $d];
        if ($d['status'] === 'added') return [$vid, $v, $d];
        if ($d['reason'] === 'recent' && $recent === null) $recent = [$vid, $v, $d];
    }
    return $recent ?? $first;
}

// Записываем решение по строке; если трек добавлен — ставим в очередь и запоминаем в контексте импорта
function mi_apply(array $user, array $it, string $vid, ?array $v, array $d, array &$ctx, string $importTitle): void {
    $row = ['video_id' => $vid, 'status' => $d['status'], 'reason' => $d['reason'], 'info' => $d['info'], 'updated_at' => now()];
    if ($v) $row['video_title'] = mb_substr($v['title'], 0, 300);
    if ($d['status'] === 'added') {
        $row['song_id'] = mi_queue_insert($user, $v, 'импорт: ' . mb_substr($importTitle !== '' ? $importTitle : 'список', 0, 30));
        $row['info'] = 'В очереди';
        $ctx['q'][$vid] = true;
        $ctx['i']['v:' . $vid] = true;
        $ctx['i']['k:' . music_split($v['title'])['key']] = true;
    }
    db_update('music_import_items', $row, 'id = ?', [$it['id']]);
}

// Трек в конец очереди (способ «импорт»: без лимита заказов и без проверки стримера)
function mi_queue_insert(array $user, array $v, string $requester): int {
    $pos = (int)(db_one("SELECT MAX(pos) AS m FROM songs WHERE user_id = ? AND status = 'queued'", [$user['id']])['m'] ?? 0) + 1;
    return db_insert('songs', [
        'user_id' => $user['id'], 'video_id' => $v['id'], 'url' => 'https://youtu.be/' . $v['id'], 'source' => 'YouTube', 'title' => $v['title'],
        'duration' => $v['duration'], 'requester' => $requester, 'method' => 'import', 'status' => 'queued', 'pos' => $pos, 'created_at' => now(),
    ]);
}

// Один проход по импорту. Поиски — по порядку и не дальше лимита; потом проверка деталей пачкой и постановка в очередь по порядку.
// Блокировка по импорту: два параллельных прохода не ставят один трек дважды.
function music_import_step(array $user, int $importId, int $cap = MI_STEP): void {
    $uid = (int)$user['id'];
    $imp = db_one('SELECT * FROM music_imports WHERE id = ? AND user_id = ?', [$importId, $uid]);
    if (!$imp || $imp['status'] !== 'running') return;
    if (kv_get('mi:lock:' . $importId)) return;
    kv_set('mi:lock:' . $importId, 1, 30);
    try {
        if (!plan_limits($user)['music']) {
            db_update('music_imports', ['status' => 'paused', 'updated_at' => now()], 'id = ?', [$importId]);
            return;
        }
        $items = db_all("SELECT * FROM music_import_items WHERE import_id = ? AND status = 'queued' ORDER BY pos LIMIT " . (int)$cap, [$importId]);
        if (!$items) {
            db_update('music_imports', ['status' => 'done', 'updated_at' => now()], 'id = ?', [$importId]);
            return;
        }
        $batch = [];
        foreach ($items as $it) {
            if ($it['video_id'] === '') {
                $cands = yt_search_items($it['query'], 5);
                if ($cands === null) {
                    if (yt_budget_left() <= 0) break; // лимит на сегодня: этот и все следующие ждут по порядку
                    $att = (int)$it['attempts'] + 1;
                    $row = ['attempts' => $att, 'reason' => 'error', 'info' => MI_REASON_TEXT['error'], 'updated_at' => now()];
                    if ($att >= 3) $row['status'] = 'skipped';
                    db_update('music_import_items', $row, 'id = ?', [$it['id']]);
                    continue;
                }
                $m = mi_pick_from($it, $cands);
                if (!$m['strong'] && !$m['unsure']) {
                    db_update('music_import_items', ['status' => 'skipped', 'reason' => 'not_found', 'info' => MI_REASON_TEXT['not_found'], 'updated_at' => now()], 'id = ?', [$it['id']]);
                    continue;
                }
                if (!$m['strong']) {
                    $u = $m['unsure'];
                        db_update('music_import_items', ['status' => 'unsure', 'cand_id' => $u['id'], 'cands' => json_encode([$u['id']]), 'cand_title' => mb_substr($u['title'], 0, 300),
                        'cand_channel' => mb_substr($u['channel'], 0, 128), 'reason' => '', 'updated_at' => now()], 'id = ?', [$it['id']]);
                    continue;
                }
                $first = $m['strong'][0];
                $ids = array_column($m['strong'], 'id');
                db_update('music_import_items', ['video_id' => $first['id'], 'cand_id' => $first['id'], 'cands' => json_encode($ids), 'cand_title' => mb_substr($first['title'], 0, 300),
                    'cand_channel' => mb_substr($first['channel'], 0, 128), 'updated_at' => now()], 'id = ?', [$it['id']]);
                $batch[] = [$it, $ids];
            } else {
                $batch[] = [$it, [$it['video_id']]];
            }
        }
        if (!$batch) return;
        $ids = [];
        foreach ($batch as [$it, $vids]) foreach ($vids as $vid) $ids[] = $vid;
        $det = yt_details(array_values(array_unique($ids)));
        if (!$det) { // деталей нет совсем — это сбой, а не удалённые видео: ждём следующего прохода
            foreach ($batch as [$it, $vids]) db_update('music_import_items', ['attempts' => (int)$it['attempts'] + 1, 'reason' => 'error', 'info' => MI_REASON_TEXT['error'], 'updated_at' => now()], 'id = ?', [$it['id']]);
            return;
        }
        $ctx = mi_context($uid, $importId);
        $cfg = music_config($uid);
        foreach ($batch as [$it, $vids]) {
            [$vid, $v, $d] = mi_choose_candidate($vids, $det, $ctx, $cfg);
            mi_apply($user, $it, $vid, $v, $d, $ctx, (string)$imp['title']);
        }
    } finally {
        kv_set('mi:lock:' . $importId, 0, 1);
        // все строки решены — импорт готов (ждущие лимита строки не считаются решёнными)
        db_exec("UPDATE music_imports SET status = 'done', updated_at = ? WHERE id = ? AND status = 'running' AND NOT EXISTS (SELECT 1 FROM music_import_items WHERE import_id = ? AND status = 'queued')",
            [now(), $importId, $importId]);
    }
}

// Действия стримера по одной строке
function music_import_act(array $user, int $itemId, string $action, string $url = ''): void {
    $uid = (int)$user['id'];
    $it = db_one('SELECT * FROM music_import_items WHERE id = ? AND user_id = ?', [$itemId, $uid]) ?? fail('Трек не найден', 404);
    $imp = db_one('SELECT * FROM music_imports WHERE id = ?', [(int)$it['import_id']]);
    if (!plan_limits($user)['music']) fail('Музыка доступна на тарифе «Про» и выше');
    if ($it['status'] === 'added') fail('Трек уже в очереди');
    $force = false;
    $vids = json_decode((string)$it['cands'], true) ?: [];
    switch ($action) {
        case 'pick': // «Да, это он»: кандидат из выдачи
            if ($it['status'] !== 'unsure' || !$vids) fail('Здесь нечего подтверждать');
            break;
        case 'link': // свою ссылку на видео добавляем, даже если трек недавно играл
            $vids = [yt_parse_id($url) ?? fail('Вставь ссылку на видео YouTube')];
            $force = true;
            break;
        case 'force': // «Добавить всё равно»: все уверенные варианты строки, играл недавно
            if ($it['status'] !== 'skipped' || $it['reason'] !== 'recent') fail('Этот трек не пропущен из-за повтора');
            $force = true;
            break;
        default:
            fail('Неизвестное действие');
    }
    $det = yt_details(array_values(array_unique($vids)));
    $ctx = mi_context($uid, (int)$it['import_id']);
    [$vid, $v, $d] = mi_choose_candidate($vids, $det, $ctx, music_config($uid), $force);
    mi_apply($user, $it, $vid, $v, $d, $ctx, (string)($imp['title'] ?? ''));
}

// «Добавить все проверенные»: все строки «Проверьте» одним запросом деталей
function music_import_pick_all(array $user, int $importId): int {
    $uid = (int)$user['id'];
    $imp = db_one('SELECT * FROM music_imports WHERE id = ? AND user_id = ?', [$importId, $uid]) ?? fail('Импорт не найден', 404);
    if (!plan_limits($user)['music']) fail('Музыка доступна на тарифе «Про» и выше');
    $items = db_all("SELECT * FROM music_import_items WHERE import_id = ? AND user_id = ? AND status = 'unsure' AND cand_id <> '' ORDER BY pos LIMIT " . MI_MAX_ITEMS, [$importId, $uid]);
    if (!$items) return 0;
    $det = yt_details(array_values(array_unique(array_column($items, 'cand_id'))));
    $ctx = mi_context($uid, $importId);
    $cfg = music_config($uid);
    $added = 0;
    foreach ($items as $it) {
        $v = $det[$it['cand_id']] ?? null;
        $d = mi_decide($v, $it['cand_id'], $ctx, $cfg, false);
        mi_apply($user, $it, $it['cand_id'], $v, $d, $ctx, (string)$imp['title']);
        if ($d['status'] === 'added') $added++;
    }
    return $added;
}

function music_import_cancel(array $user, int $importId): void {
    db_one('SELECT id FROM music_imports WHERE id = ? AND user_id = ?', [$importId, $user['id']]) ?? fail('Импорт не найден', 404);
    db_exec("UPDATE music_import_items SET status = 'skipped', reason = 'cancelled', info = ?, updated_at = ? WHERE import_id = ? AND status = 'queued'",
        [MI_REASON_TEXT['cancelled'], now(), $importId]);
    db_update('music_imports', ['status' => 'cancelled', 'updated_at' => now()], 'id = ?', [$importId]);
}

// Вид строки для интерфейса: текст, статус, пояснение и доступные действия
function mi_row_view(array $r, bool $budgetOut): array {
    $text = $r['artist'] !== '' ? $r['artist'] . ' — ' . $r['track'] : $r['track'];
    if ($r['status'] === 'added' && $r['video_title'] !== '') $text = $r['video_title'];
    if ($r['status'] === 'queued' && $r['video_id'] === '' && $budgetOut) $label = 'Ждёт лимита';
    else $label = match ($r['status']) { 'added' => 'Добавлен', 'unsure' => 'Проверьте', 'skipped' => 'Не добавлен', default => 'Ищем' };
    $info = mb_strtoupper(mb_substr($r['info'], 0, 1)) . mb_substr($r['info'], 1); // причины из чата — строчные, здесь с заглавной
    if ($r['status'] === 'queued' && $r['video_id'] === '' && $budgetOut) $info = MI_REASON_TEXT['budget'];
    if ($r['status'] === 'unsure') $info = 'Нашли «' . $r['cand_title'] . '»' . ($r['cand_channel'] !== '' ? ' (' . $r['cand_channel'] . ')' : '') . '. Это тот трек?';
    return [
        'id' => (int)$r['id'], 'pos' => (int)$r['pos'], 'text' => $text, 'status' => $r['status'], 'label' => $label, 'info' => $info,
        'canPick' => $r['status'] === 'unsure', 'canLink' => $r['status'] !== 'added', 'canForce' => $r['status'] === 'skipped' && $r['reason'] === 'recent',
    ];
}

// Последний импорт канала со всеми строками, счётчиками и остатком лимита поиска
function music_import_view(array $user): ?array {
    $uid = (int)$user['id'];
    $imp = db_one('SELECT * FROM music_imports WHERE user_id = ? ORDER BY id DESC LIMIT 1', [$uid]);
    if (!$imp) return null;
    $budgetOut = yt_budget_left() <= 0;
    $counts = ['added' => 0, 'skipped' => 0, 'unsure' => 0, 'queued' => 0];
    $items = [];
    foreach (db_all('SELECT * FROM music_import_items WHERE import_id = ? ORDER BY pos', [(int)$imp['id']]) as $r) {
        $counts[$r['status']] = ($counts[$r['status']] ?? 0) + 1;
        $items[] = mi_row_view($r, $budgetOut);
    }
    return [
        'id' => (int)$imp['id'], 'source' => $imp['source'], 'title' => $imp['title'], 'note' => $imp['note'], 'status' => $imp['status'],
        'counts' => $counts, 'total' => count($items), 'items' => $items,
        'budget' => ['left' => yt_budget_left(), 'limit' => yt_budget_limit()],
    ];
}

// Фоновая задача: продолжаем незаконченные импорты, пока есть лимит поиска
function music_import_job(): void {
    foreach (db_all("SELECT DISTINCT user_id FROM music_imports WHERE status = 'running' ORDER BY user_id LIMIT 10") as $r) {
        $u = db_one('SELECT * FROM users WHERE id = ? AND banned = 0', [(int)$r['user_id']]);
        $imp = $u ? db_one("SELECT id FROM music_imports WHERE user_id = ? AND status = 'running' ORDER BY id LIMIT 1", [$u['id']]) : null;
        if ($imp) music_import_step($u, (int)$imp['id'], MI_STEP);
    }
}
