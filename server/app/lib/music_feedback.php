<?php
// Лайки и дизлайки музыки. Стример и помощники голосуют весом 3, зрители — командами !лайк и !дизлайк весом 1 (вместе не больше ±3 на трек).
// Итог влияет на подбор: трек или исполнитель с итогом ≤ -3 не ставим, с итогом ≥ 3 — подталкиваем.
// Трек определяется песней (music_split), исполнитель — нормализованным именем. В базе хранится только sha1 от вида и имени, сами имена — для показа.

const FB_WEIGHT_TEAM = 3;   // стример и помощники
const FB_WEIGHT_VIEWER = 1; // зритель
const FB_VIEWER_CAP = 3;    // все голоса зрителей вместе на один трек или исполнителя
const FB_LIMIT = 3;         // с этого итога голос решает подбор: блокирует или подталкивает

// Ключ записи в базе: вид и нормализованное имя (песня или исполнитель)
function fb_fkey(string $kind, string $norm): string {
    return sha1($kind . '|' . $norm);
}

// Голос записываем по ключу. value: 1 — лайк, -1 — дизлайк, 0 — снять голос.
// Голос команды (стример или помощник) — chatter пустой, один на трек. Зритель — свой chatter, один голос на трек.
function fb_vote(int $uid, string $kind, string $norm, int $value, string $chatter, int $weight, array $meta = []): void {
    $fkey = fb_fkey($kind, $norm);
    $row = db_one('SELECT id FROM music_feedback WHERE user_id = ? AND kind = ? AND fkey = ? AND chatter_id = ?', [$uid, $kind, $fkey, $chatter]);
    if ($value === 0) {
        if ($row) db_exec('DELETE FROM music_feedback WHERE id = ?', [$row['id']]);
        return;
    }
    $data = [
        'value' => $value > 0 ? 1 : -1, 'weight' => $weight, 'norm' => $norm,
        'title' => mb_substr((string)($meta['title'] ?? ''), 0, 300), 'artist' => mb_substr((string)($meta['artist'] ?? ''), 0, 200),
        'by_login' => mb_substr((string)($meta['by'] ?? ''), 0, 64), 'updated_at' => now(),
    ];
    if ($row) db_update('music_feedback', $data, 'id = ?', [$row['id']]);
    else db_insert('music_feedback', $data + ['user_id' => $uid, 'kind' => $kind, 'fkey' => $fkey, 'chatter_id' => $chatter, 'created_at' => now()]);
}

// Итоги по видам: [вид => [ключ => счёт]]. Голоса команды идут как есть, голоса зрителей — с капом
function fb_scores(int $uid): array {
    $out = ['track' => [], 'artist' => []];
    $viewers = [];
    foreach (db_all('SELECT kind, fkey, chatter_id, value, weight FROM music_feedback WHERE user_id = ?', [$uid]) as $r) {
        $v = (int)$r['value'] * (int)$r['weight'];
        if ($r['chatter_id'] === '') $out[$r['kind']][$r['fkey']] = ($out[$r['kind']][$r['fkey']] ?? 0) + $v;
        else $viewers[$r['kind']][$r['fkey']] = ($viewers[$r['kind']][$r['fkey']] ?? 0) + $v;
    }
    foreach ($viewers as $kind => $list) {
        foreach ($list as $fkey => $v) {
            $out[$kind][$fkey] = ($out[$kind][$fkey] ?? 0) + max(-FB_VIEWER_CAP, min(FB_VIEWER_CAP, $v));
        }
    }
    return $out;
}

// Правила подбора из голосов: что не ставим, что подталкиваем, и имена любимых исполнителей (для профиля вкуса)
function fb_rules(int $uid): array {
    $scores = fb_scores($uid);
    $rules = ['blockTrack' => [], 'blockArtist' => [], 'likeTrack' => [], 'likeArtist' => [], 'likeArtistNames' => [], 'blockArtistNames' => []];
    foreach ($scores['track'] as $fkey => $s) {
        if ($s <= -FB_LIMIT) $rules['blockTrack'][$fkey] = true;
        elseif ($s >= FB_LIMIT) $rules['likeTrack'][$fkey] = true;
    }
    foreach ($scores['artist'] as $fkey => $s) {
        if ($s <= -FB_LIMIT) $rules['blockArtist'][$fkey] = true;
        elseif ($s >= FB_LIMIT) $rules['likeArtist'][$fkey] = true;
    }
    foreach (db_all("SELECT fkey, norm, artist FROM music_feedback WHERE user_id = ? AND kind = 'artist' AND value > 0", [$uid]) as $r) {
        if (isset($rules['likeArtist'][$r['fkey']])) $rules['likeArtistNames'][(string)$r['norm']] = (string)$r['artist'];
    }
    foreach (db_all("SELECT fkey, norm, artist FROM music_feedback WHERE user_id = ? AND kind = 'artist' AND value < 0", [$uid]) as $r) {
        if (isset($rules['blockArtist'][$r['fkey']])) $rules['blockArtistNames'][(string)$r['norm']] = (string)$r['artist'];
    }
    return $rules;
}

// Голос стримера (или помощника) по каждой песне: [ключ песни => like | dislike], для кнопок в панели
function fb_own_marks(int $uid): array {
    $out = [];
    foreach (db_all("SELECT fkey, value FROM music_feedback WHERE user_id = ? AND kind = 'track' AND chatter_id = ''", [$uid]) as $r) {
        $out[$r['fkey']] = (int)$r['value'] > 0 ? 'like' : 'dislike';
    }
    return $out;
}

// Отметка стримера для строки очереди или истории: по названию песни
function fb_song_mark(array $marks, string $title): string {
    return $marks[fb_fkey('track', music_split($title)['key'])] ?? '';
}

// Голос в чате за песню, которая сейчас играет (команда !лайк / !дизлайк)
function fb_vote_by_chat(array $user, array $song, string $chatterId, int $value, int $weight, string $by): void {
    $p = music_split((string)$song['title']);
    fb_vote((int)$user['id'], 'track', $p['key'], $value, $chatterId, $weight, ['title' => $song['title'], 'artist' => $p['raw'], 'by' => $by]);
}

// Итог по песне для ответа в чате: сколько лайков и дизлайков видно по её ключу (только счёт, без имён зрителей)
function fb_track_score(int $uid, string $title): int {
    return fb_scores($uid)['track'][fb_fkey('track', music_split($title)['key'])] ?? 0;
}

// Кэш отметок стримера на время запроса: song_row() берёт отметку для каждой строки очереди без лишних запросов
function fb_own_cache(int $uid): array {
    static $cache = [];
    return $cache[$uid] ??= fb_own_marks($uid);
}

// Голос из панели: лайк, дизлайк или 0 — снять. Дизлайк трека убирает его из очереди или пропускает, если он играет.
// Дизлайк исполнителя — то же для всех его треков в очереди. Голос стримера или помощника — общий, вес 3.
function fb_act(array $user, string $kind, int $songId, int $value, string $by): void {
    $uid = (int)$user['id'];
    $song = db_one('SELECT * FROM songs WHERE id = ? AND user_id = ?', [$songId, $uid]) ?? fail('Трек не найден', 404);
    $p = music_split((string)$song['title']);
    $meta = ['title' => (string)$song['title'], 'artist' => $p['raw'], 'by' => $by];
    if ($kind === 'artist') {
        if ($p['artist'] === '') fail('У этого трека не видно исполнителя');
        fb_vote($uid, 'artist', $p['artist'], $value, '', FB_WEIGHT_TEAM, $meta);
        if ($value < 0) {
            foreach (db_all("SELECT * FROM songs WHERE user_id = ? AND status = 'queued'", [$uid]) as $q) {
                if (music_split((string)$q['title'])['artist'] === $p['artist']) music_act($user, 'remove', (int)$q['id']);
            }
        }
        return;
    }
    fb_vote($uid, 'track', $p['key'], $value, '', FB_WEIGHT_TEAM, $meta);
    if ($value < 0) {
        if ($song['status'] === 'queued') music_act($user, 'remove', $songId);
        elseif ($song['status'] === 'playing') music_act($user, 'next', 0);
    }
}

// Голос в чате за песню, которая играет (!лайк / !дизлайк). Стример и помощники — общий голос весом 3, зритель — свой весом 1.
// Зритель голосует не чаще раза в 5 секунд: иначе чат засыпают ответами.
function music_vote_chat(array $user, array $ctx, int $value): void {
    $bid = $user['twitch_id'];
    $cur = db_one("SELECT * FROM songs WHERE user_id = ? AND status = 'playing' ORDER BY id DESC LIMIT 1", [$user['id']]);
    if (!$cur) {
        tw_send($bid, '@' . $ctx['name'] . ', сейчас ничего не играет', $ctx['msgId']);
        return;
    }
    $team = !empty($ctx['roles']['broadcaster']) || !empty($ctx['roles']['mod']);
    if (!$team) {
        $ck = 'vote:' . $user['id'] . ':' . $ctx['chatterId'];
        $last = db_one('SELECT last FROM cooldowns WHERE k = ?', [$ck]);
        if ($last && (int)$last['last'] > now() - 5) return;
        set_cooldown($ck);
    }
    fb_vote_by_chat($user, $cur, $team ? '' : (string)$ctx['chatterId'], $value, $team ? FB_WEIGHT_TEAM : FB_WEIGHT_VIEWER, (string)$ctx['name']);
    tw_send($bid, '@' . $ctx['name'] . ', ' . ($value > 0 ? 'лайк' : 'дизлайк') . ' засчитан', $ctx['msgId']);
}
