<?php
// YouTube Data API: данные о треке по ссылке, поиск и кандидаты для автоподбора (ключ YOUTUBE_API_KEY).
// Квота: search.list стоит 100 единиц из суточных 10 000, videos.list — 1 единицу на запрос (до 50 видео).
// Поэтому поиск кэшируется по запросу и ограничен суточным лимитом YOUTUBE_SEARCH_DAILY.

const YT_PARTS = 'snippet,contentDetails,statistics,status';

function yt_parse_id(string $s): ?string {
    $s = trim($s);
    if (preg_match('~(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/|live/)|youtu\.be/|music\.youtube\.com/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})~', $s, $m)) return $m[1];
    if (preg_match('~^[A-Za-z0-9_-]{11}$~', $s)) return $s;
    return null;
}

function yt_duration(string $iso): int {
    if (!preg_match('~P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?~', $iso, $m)) return 0;
    return ((int)($m[1] ?? 0)) * 86400 + ((int)($m[2] ?? 0)) * 3600 + ((int)($m[3] ?? 0)) * 60 + (int)($m[4] ?? 0);
}

// Видео в одном виде: и для заказа по ссылке, и для автоподбора
function yt_video_row(array $v): array {
    return [
        'id' => (string)($v['id'] ?? ''),
        'title' => html_entity_decode($v['snippet']['title'] ?? '', ENT_QUOTES),
        'channel' => $v['snippet']['channelTitle'] ?? '',
        'duration' => yt_duration($v['contentDetails']['duration'] ?? ''),
        'views' => (int)($v['statistics']['viewCount'] ?? 0),
        'embeddable' => (bool)($v['status']['embeddable'] ?? true),
        'live' => ($v['snippet']['liveBroadcastContent'] ?? 'none') !== 'none',
    ];
}

function yt_video(string $id): ?array {
    $key = cfg('YOUTUBE_API_KEY');
    if (!$key) return null;
    $r = http_request('GET', 'https://www.googleapis.com/youtube/v3/videos?' . http_build_query(['part' => YT_PARTS, 'id' => $id, 'key' => $key]));
    $v = $r['json']['items'][0] ?? null;
    return $v ? yt_video_row($v) : null;
}

function yt_search(string $q): ?array {
    $key = cfg('YOUTUBE_API_KEY');
    if (!$key) return null;
    $r = http_request('GET', 'https://www.googleapis.com/youtube/v3/search?' . http_build_query([
        'part' => 'snippet', 'q' => $q, 'type' => 'video', 'maxResults' => 1, 'videoEmbeddable' => 'true', 'regionCode' => 'RU', 'key' => $key,
    ]));
    $id = $r['json']['items'][0]['id']['videoId'] ?? null;
    return $id ? yt_video($id) : null;
}

// Детали сразу для списка видео: одна единица квоты на 50 видео
function yt_details(array $ids): array {
    $key = cfg('YOUTUBE_API_KEY');
    $out = [];
    if (!$key) return $out;
    foreach (array_chunk(array_values(array_unique($ids)), 50) as $part) {
        $r = http_request('GET', 'https://www.googleapis.com/youtube/v3/videos?' . http_build_query(['part' => YT_PARTS, 'id' => implode(',', $part), 'key' => $key]));
        if ($r['code'] !== 200) continue;
        foreach ($r['json']['items'] ?? [] as $v) {
            $row = yt_video_row($v);
            $out[$row['id']] = $row;
        }
    }
    return $out;
}

// Суточный лимит поисков. Кэшированный ответ лимит не тратит. Когда лимит кончился, подбор работает на чарте и уже найденном.
function yt_budget_take(): bool {
    $k = 'yt:budget:' . gmdate('Ymd');
    $used = (int)(kv_get($k) ?? 0);
    if ($used >= (int)(cfg('YOUTUBE_SEARCH_DAILY') ?: 60)) return false;
    kv_set($k, $used + 1, 2 * 86400);
    return true;
}

// Кандидаты для подбора по запросу (исполнитель, название). Кэш на неделю: один исполнитель с разных каналов не тратит квоту дважды.
// Фильтр по длительности не ставим: «medium» у YouTube отсекает песни короче 4 минут, длину проверяем сами.
function yt_search_items(string $q, int $n = 50, string $order = 'relevance'): array {
    $key = 'yt:s:' . sha1(mb_strtolower($q) . '|' . $n . '|' . $order);
    $hit = kv_get($key);
    if (is_array($hit)) return $hit;
    $apiKey = cfg('YOUTUBE_API_KEY');
    if (!$apiKey || !yt_budget_take()) return [];
    $r = http_request('GET', 'https://www.googleapis.com/youtube/v3/search?' . http_build_query([
        'part' => 'snippet', 'q' => $q, 'type' => 'video', 'videoCategoryId' => '10', 'videoEmbeddable' => 'true',
        'order' => $order, 'maxResults' => $n, 'regionCode' => 'RU', 'key' => $apiKey,
    ]));
    if ($r['code'] !== 200) return [];
    $items = [];
    foreach ($r['json']['items'] ?? [] as $i) {
        $id = $i['id']['videoId'] ?? '';
        if ($id !== '') $items[] = ['id' => $id, 'title' => html_entity_decode($i['snippet']['title'] ?? '', ENT_QUOTES), 'channel' => $i['snippet']['channelTitle'] ?? ''];
    }
    kv_set($key, $items, 7 * 86400);
    return $items;
}

// Популярная музыка по России (чарт YouTube): обновляется раз в 12 часов и стоит одну единицу квоты.
function yt_chart_items(): array {
    $hit = kv_get('yt:chart:RU');
    if (is_array($hit)) return $hit;
    $apiKey = cfg('YOUTUBE_API_KEY');
    if (!$apiKey) return [];
    $r = http_request('GET', 'https://www.googleapis.com/youtube/v3/videos?' . http_build_query([
        'part' => YT_PARTS, 'chart' => 'mostPopular', 'videoCategoryId' => '10', 'regionCode' => 'RU', 'maxResults' => 50, 'key' => $apiKey,
    ]));
    if ($r['code'] !== 200) return [];
    $items = [];
    foreach ($r['json']['items'] ?? [] as $v) {
        $row = yt_video_row($v);
        $items[] = ['id' => $row['id'], 'title' => $row['title'], 'channel' => $row['channel']];
    }
    kv_set('yt:chart:RU', $items, 12 * 3600);
    return $items;
}
