<?php
// Картинки для чата: эмодзи Twitch и значки (модератор, подписчик, VIP, события и т. д.).
// Значки берём из Twitch Helix и кэшируем на сутки: глобальные и значки канала отдельно.

// Фрагменты сообщения — только текст и эмодзи (как их показывать в виджете)
function chat_frags(array $fragments): array {
    $out = [];
    foreach (array_slice($fragments, 0, 80) as $f) {
        $type = (string)($f['type'] ?? 'text');
        $text = (string)($f['text'] ?? '');
        if ($type === 'emote' && !empty($f['emote']['id'])) $out[] = ['e' => (string)$f['emote']['id'], 'x' => $text];
        else $out[] = ['x' => $text];
    }
    return $out;
}

// Карта значков: [set][version] => url. Глобальные и канала объединяются.
function badge_map(string $broadcasterId): array {
    $ck = 'badge_map:' . $broadcasterId;
    if ($cached = kv_get($ck)) return $cached;
    $map = [];
    $paths = [['chat/badges/global', null], ['chat/badges', ['broadcaster_id' => $broadcasterId]]];
    foreach ($paths as [$path, $q]) {
        if ($path === 'chat/badges' && $broadcasterId === '') continue;
        $r = helix('GET', $path, $q);
        foreach (($r['json']['data'] ?? []) as $set) {
            foreach (($set['versions'] ?? []) as $v) {
                $map[(string)$set['set_id']][(string)$v['id']] = (string)($v['image_url_2x'] ?? $v['image_url_1x'] ?? '');
            }
        }
    }
    if ($map) kv_set($ck, $map, 86400);
    return $map;
}

// Эмодзи 7TV: название => id. Глобальный набор и набор канала (канал перекрывает глобальный). Кэш на час.
function seventv_map(string $twitchId): array {
    $ck = 'seventv:' . $twitchId;
    if ($cached = kv_get($ck)) return $cached;
    $map = [];
    $add = function (?array $emotes) use (&$map) {
        foreach (($emotes ?? []) as $e) {
            if (!empty($e['name']) && !empty($e['id'])) $map[(string)$e['name']] = (string)$e['id'];
        }
    };
    $g = http_request('GET', 'https://7tv.io/v3/emote-sets/global', [], null, 8);
    if ($g['code'] === 200) $add($g['json']['emotes'] ?? []);
    if ($twitchId !== '') {
        $c = http_request('GET', 'https://7tv.io/v3/users/twitch/' . rawurlencode($twitchId), [], null, 8);
        if ($c['code'] === 200) $add($c['json']['emote_set']['emotes'] ?? []);
    }
    if ($map) kv_set($ck, $map, 3600);
    return $map;
}
