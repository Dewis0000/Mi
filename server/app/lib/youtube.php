<?php
// YouTube Data API: данные о треке по ссылке и поиск по названию (ключ YOUTUBE_API_KEY).

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

function yt_video(string $id): ?array {
    $key = cfg('YOUTUBE_API_KEY');
    if (!$key) return null;
    $r = http_request('GET', 'https://www.googleapis.com/youtube/v3/videos?' . http_build_query(['part' => 'snippet,contentDetails,statistics,status', 'id' => $id, 'key' => $key]));
    $v = $r['json']['items'][0] ?? null;
    if (!$v) return null;
    return [
        'id' => $id,
        'title' => html_entity_decode($v['snippet']['title'] ?? '', ENT_QUOTES),
        'channel' => $v['snippet']['channelTitle'] ?? '',
        'duration' => yt_duration($v['contentDetails']['duration'] ?? ''),
        'views' => (int)($v['statistics']['viewCount'] ?? 0),
        'embeddable' => (bool)($v['status']['embeddable'] ?? true),
        'live' => ($v['snippet']['liveBroadcastContent'] ?? 'none') !== 'none',
    ];
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
