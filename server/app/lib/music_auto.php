<?php
// Автоподбор музыки: когда очередь пуста, канал не остаётся в тишине.
// Цель — как «волна» в музыкальных сервисах: похожие, но другие треки, без повтора той же песни и без одного исполнителя подряд.
// Данных о слушателях YouTube не даёт, поэтому подбор собран из четырёх источников и жёстких правил повтора:
//   artist   — ещё песни исполнителя, которого уже играли на канале
//   neighbor — исполнители, которых играют те же каналы StreOps, что и этого исполнителя (анонимно, по названиям песен)
//   chart    — популярное в музыке по России
//   explore  — исполнитель, которого на канале ещё не было, но его слушают другие каналы
// Правила повтора:
//   песня — раз в 60 дней; название важнее исполнителя, значит кавер или перезалив той же песни тоже не повторяется;
//   исполнитель — не в последних 5 треках и не больше 2 раз в последних 20.
// Если подходящих треков нет, правила смягчаются по ступеням (AUTO_LEVELS), и очередь почти не остаётся пустой.

const AUTO_LEVELS = [
    'strict' => ['days' => 60, 'gap' => 5, 'max' => 2],
    'relaxed' => ['days' => 14, 'gap' => 2, 'max' => 4],
    'any' => ['days' => 2, 'gap' => 0, 'max' => 99],
    'last' => ['days' => 0, 'gap' => 1, 'max' => 99], // всё исчерпано: лучше давний трек, чем тишина; только сразу после предыдущего не ставим
];
// Доли источников по стилям подбора (настройка канала «music.mix»)
const AUTO_MIX = [
    'mixed' => ['artist' => 35, 'neighbor' => 35, 'chart' => 20, 'explore' => 10],
    'similar' => ['artist' => 50, 'neighbor' => 50],
    'discover' => ['artist' => 15, 'neighbor' => 35, 'chart' => 25, 'explore' => 25],
];
// Служебные слова ролика: мешают сравнить названия (Official Video, HD, cover)
const AUTO_NOISE = [
    'official', 'officiel', 'официальный', 'официальное', 'video', 'видео', 'audio', 'аудио', 'lyrics', 'lyric', 'текст',
    'hd', 'hq', '4k', 'mv', 'клип', 'clip', 'премьера', 'premiere', 'cover', 'кавер', 'topic', 'vevo', 'music',
    'remastered', 'ремастер', 'feat', 'ft', 'prod',
];
// Что не подбираем ни при каких условиях: караоке, минусовки, часовые миксы
const AUTO_EXCLUDE = [
    'karaoke', 'караоке', 'минус', 'instrumental', 'инструментал', 'slowed', 'sped up', 'nightcore', 'reverb', '8d',
    'bass boosted', '1 hour', '1 час', 'подборка', 'playlist', 'сборник', 'compilation', 'топ 10',
];
const AUTO_HISTORY = 400; // сколько последних записей канала учитываем при подборе
const AUTO_DECAY = 0.96;  // вес вкуса падает на 4% за каждый трек назад

// Название приводим к виду для сравнения: без регистра, скобок, служебных слов и знаков
function music_norm(string $s): string {
    $s = str_replace('ё', 'е', mb_strtolower($s));
    $s = preg_replace('~[\(\[\{][^\)\]\}]*[\)\]\}]~u', ' ', $s); // (Official Video), [HD], {cover}
    $s = preg_replace('~[^\p{L}\p{N}]+~u', ' ', $s);
    $words = array_filter(explode(' ', trim($s)), fn($w) => $w !== '' && !in_array($w, AUTO_NOISE, true));
    return implode(' ', $words);
}

// Ключ песни: одинаковое название — одна песня, даже у другого исполнителя или канала.
// Короткие названия («Любовь») сравниваем только вместе с исполнителем, иначе разные песни совпадут.
function music_song_key(string $artist, string $track): string {
    return mb_strlen($track) >= 8 ? $track : $artist . '|' . $track;
}

// Разбор заголовка видео «Исполнитель — Песня». Без тире исполнителя нет, и правило по исполнителю не срабатывает.
function music_split(string $title): array {
    $raw = '';
    $track = $title;
    if (preg_match('~^(.+?)\s+[-–—]\s+(.+)$~u', $title, $m)) {
        $raw = trim($m[1]);
        $track = $m[2];
    }
    $artist = music_norm($raw);
    $trk = music_norm($track);
    return ['artist' => $artist, 'track' => $trk, 'raw' => $raw, 'key' => music_song_key($artist, $trk)];
}

// История канала и очередь, новее первых
function music_memory(int $uid): array {
    $rows = db_all("SELECT title, video_id, status, method, played_at, created_at FROM songs WHERE user_id = ? AND status IN ('played','skipped','queued','playing','pending') ORDER BY id DESC LIMIT " . AUTO_HISTORY, [$uid]);
    return array_map(function ($r) {
        $t = music_split((string)$r['title']);
        return [
            'id' => (string)$r['video_id'], 'artist' => $t['artist'], 'raw' => $t['raw'], 'key' => $t['key'],
            'status' => (string)$r['status'], 'method' => (string)$r['method'], 'at' => (int)($r['played_at'] ?: $r['created_at']),
        ];
    }, $rows);
}

// Вкус канала: вес исполнителя. Свежее весит больше, заказанное — вдвое больше автоподбора, пропущенное уменьшает вес.
function music_profile(array $mem): array {
    $w = [];
    $raw = [];
    foreach ($mem as $i => $m) {
        if ($m['artist'] === '') continue;
        $sign = $m['status'] === 'skipped' ? -0.5 : 1.0;
        $boost = str_starts_with($m['method'], 'auto') ? 1.0 : 2.0;
        $w[$m['artist']] = ($w[$m['artist']] ?? 0) + $sign * $boost * (AUTO_DECAY ** $i);
        $raw[$m['artist']] ??= $m['raw'];
    }
    return ['w' => $w, 'raw' => $raw];
}

// Исполнители из других каналов: [исполнитель => как он написан в названии]. Личных данных слушателей здесь нет, только названия песен.
function music_pool(int $uid): array {
    $rows = db_all("SELECT user_id, title FROM songs WHERE status = 'played' AND user_id <> ? ORDER BY id DESC LIMIT 2000", [$uid]);
    $byUser = [];
    foreach ($rows as $r) {
        $t = music_split((string)$r['title']);
        if ($t['artist'] !== '') $byUser[(int)$r['user_id']][$t['artist']] = $t['raw'];
    }
    return $byUser;
}

// Исполнители, которых играют те же каналы, что и seed: счёт — сколько таких каналов у каждого.
// aff — близость к seed по шкале 0.5..1: чем чаще вместе, тем ближе.
function music_neighbors(array $byUser, string $seed): array {
    $cnt = [];
    $raw = [];
    foreach ($byUser as $artists) {
        if (!isset($artists[$seed])) continue;
        foreach ($artists as $a => $r) {
            if ((string)$a === $seed) continue;
            $cnt[(string)$a] = ($cnt[(string)$a] ?? 0) + 1;
            $raw[(string)$a] = $r;
        }
    }
    arsort($cnt);
    $out = [];
    $max = $cnt ? max($cnt) : 1;
    foreach (array_slice($cnt, 0, 10, true) as $a => $n) {
        $out[$a] = ['raw' => $raw[$a], 'score' => $n, 'aff' => 0.5 + 0.5 * $n / $max];
    }
    return $out;
}

// Исполнители из других каналов, которых на этом канале ещё не было: [исполнитель => как написан]
function music_explore(array $byUser, array $known): array {
    $out = [];
    foreach ($byUser as $artists) {
        foreach ($artists as $a => $r) {
            if (!isset($known[$a])) $out[$a] = $r;
        }
    }
    return $out;
}

// Исполнители канала, от которых ищем «ещё от него» и соседей: шесть самых весомых. Каждая попытка берёт одного из них по весу,
// поэтому пул не застывает на одном исполнителе.
function music_seeds(array $prof): array {
    $pos = array_filter($prof['w'], fn($w) => $w > 0);
    arsort($pos);
    $out = [];
    foreach (array_slice($pos, 0, 6, true) as $key => $w) {
        $out[] = ['key' => (string)$key, 'raw' => $prof['raw'][$key], 'w' => $w];
    }
    return $out;
}

// Случайный исполнитель из списка, пропорционально весу
function music_seed_pick(array $seeds): array {
    $w = [];
    foreach ($seeds as $s) $w[$s['key']] = $s['w'];
    $key = music_weighted_key($w);
    foreach ($seeds as $s) if ($s['key'] === $key) return $s;
    return $seeds[0];
}

// Случайный ключ пропорционально весу
function music_weighted_key(array $w): string {
    $r = mt_rand() / mt_getrandmax() * array_sum($w);
    $acc = 0;
    foreach ($w as $k => $v) {
        $acc += $v;
        if ($r <= $acc) return (string)$k;
    }
    return (string)array_key_last($w);
}

// Порядок источников для этого подбора: сначала по весам микса, без повторов
function music_draw_sources(array $mix): array {
    $pool = array_filter($mix, fn($w) => $w > 0);
    $order = [];
    while ($pool) {
        $r = mt_rand(1, array_sum($pool));
        $acc = 0;
        foreach ($pool as $k => $w) {
            $acc += $w;
            if ($r <= $acc) {
                $order[] = $k;
                unset($pool[$k]);
                break;
            }
        }
    }
    return $order;
}

// Кандидаты из выдачи YouTube. rank — место в выдаче (первые лучше), aff — близость к вкусу канала.
// seedKey — исполнитель, по которому искали: совпадение с ним повышает близость и меняет причину.
function music_from_items(array $items, string $src, float $aff, string $seedRaw, string $seedKey): array {
    $n = max(1, count($items));
    $out = [];
    foreach (array_values($items) as $i => $it) {
        if (trim((string)$it['title']) === '') continue; // без названия трек не ставим
        $t = music_split((string)$it['title']);
        $match = $seedKey !== '' && $t['artist'] === $seedKey;
        $out[] = [
            'id' => (string)$it['id'], 'title' => (string)$it['title'], 'artist' => $t['artist'], 'raw' => $t['raw'], 'key' => $t['key'],
            'src' => $src, 'aff' => $aff * ($match ? 1.0 : 0.6), 'rank' => 1 - $i / $n, 'seedRaw' => $seedRaw, 'match' => $match,
        ];
    }
    return $out;
}

// Варианты запроса по исполнителю. У YouTube каждый даёт свою выдачу, и пул треков не иссякает,
// пока один и тот же закэшированный запрос уже весь сыгран.
const AUTO_QUERIES = [['', 'relevance'], [' песни', 'relevance'], [' лучшие песни', 'viewCount'], [' хиты', 'viewCount']];

// Кандидаты по исполнителю: случайный вариант запроса
function music_search(string $raw): array {
    [$suffix, $order] = AUTO_QUERIES[mt_rand(0, count(AUTO_QUERIES) - 1)];
    return yt_search_items($raw . $suffix, 50, $order);
}

// Кандидаты одного источника. Исполнитель-источник выбирается заново на каждой попытке.
function music_source_items(string $src, array $ctx): array {
    if ($src === 'chart') return music_from_items(yt_chart_items(), 'chart', 0.3, '', '');
    if ($src === 'explore') {
        if (!$ctx['explore']) return [];
        $key = (string)array_rand($ctx['explore']);
        return music_from_items(music_search($ctx['explore'][$key]), 'explore', 0.2, '', $key);
    }
    if (!$ctx['seeds']) return [];
    $seed = music_seed_pick($ctx['seeds']);
    if ($src === 'artist') return music_from_items(music_search($seed['raw']), 'artist', 1.0, $seed['raw'], $seed['key']);
    if ($src === 'neighbor') {
        $nbs = music_neighbors($ctx['byUser'], $seed['key']);
        if (!$nbs) return [];
        $w = [];
        foreach ($nbs as $a => $n) $w[$a] = $n['score'];
        $key = music_weighted_key($w);
        return music_from_items(music_search($nbs[$key]['raw']), 'neighbor', $nbs[$key]['aff'], $seed['raw'], $key);
    }
    return [];
}

// Текст причины для строки очереди: зрители и стример видят, почему выбран трек
function music_reason(array $c): string {
    return match ($c['src']) {
        'artist' => ($c['match'] ? 'ещё от ' : 'похоже на ') . $c['seedRaw'],
        'neighbor' => 'похоже на ' . $c['seedRaw'],
        'chart' => 'популярное сейчас',
        default => 'новое для канала',
    };
}

// Можно ли ставить кандидата при этом уровне правил
function music_blocked(array $c, array $mem, array $lvl, int $now): bool {
    $span = $lvl['days'] * 86400;
    $near = 0;
    foreach ($mem as $i => $m) {
        $recent = $now - $m['at'] < $span || $i === 0; // самый последний трек не повторяем ни на одном уровне
        if ($recent && ($m['id'] === $c['id'] || ($c['key'] !== '' && $m['key'] === $c['key']))) return true;
        if ($c['artist'] === '' || $m['artist'] !== $c['artist']) continue;
        if ($i < $lvl['gap']) return true;
        if ($i < 20) $near++;
    }
    return $near >= $lvl['max'];
}

// Служебные слова и стоп-слова канала: такие треки не подбираем
function music_excluded(string $title, array $stop): bool {
    return text_has_any($title, array_merge(AUTO_EXCLUDE, $stop)) !== null;
}

// Источники последних автоподборов, новее первого (чтобы не ставить один и тот же источник подряд)
function music_last_sources(array $mem): array {
    $out = [];
    foreach ($mem as $m) {
        if (!str_starts_with($m['method'], 'auto_')) continue;
        $out[] = substr($m['method'], 5);
        if (count($out) === 2) break;
    }
    return $out;
}

// Выбор одного трека. Чистая функция: все данные приходят в $ctx, поэтому её можно проверить без сети.
// $levels — ступени правил, которые пробуем по очереди. Возвращает кандидата с полями reason и level или null.
function music_pick(array $cands, array $ctx, array $levels): ?array {
    $maxLen = (int)$ctx['cfg']['maxLen'] > 0 ? (int)$ctx['cfg']['maxLen'] : 600;
    $ok = [];
    $seen = [];
    foreach ($cands as $c) {
        if (isset($seen[$c['id']])) continue;
        $seen[$c['id']] = true;
        $d = $ctx['details'][$c['id']] ?? null;
        if (!$d || $d['live'] || !$d['embeddable'] || $d['duration'] < 60 || $d['duration'] > $maxLen) continue;
        if ((int)$ctx['cfg']['minViews'] > 0 && $d['views'] < (int)$ctx['cfg']['minViews']) continue;
        if (music_excluded($c['title'], $ctx['cfg']['stop'] ?? [])) continue;
        $c['duration'] = $d['duration'];
        $c['views'] = $d['views'];
        $ok[] = $c;
    }
    foreach ($levels as $name) {
        $lvl = AUTO_LEVELS[$name];
        $pool = array_values(array_filter($ok, fn($c) => !music_blocked($c, $ctx['mem'], $lvl, $ctx['now'])));
        if ($pool) {
            $c = music_choose($pool, $ctx);
            $c['level'] = $name;
            return $c;
        }
    }
    return null;
}

// Из подходящих выбираем один: оценка по близости, месту в выдаче, популярности и новизне для канала, с небольшой случайностью
function music_choose(array $pool, array $ctx): array {
    $rnd = $ctx['rnd'];
    $last = $ctx['last'];
    $scored = [];
    foreach ($pool as $c) {
        $s = 0.5 * $c['rank'] + 0.6 * $c['aff'] + 0.2 * min(1, log10($c['views'] + 1) / 8) + 0.5 * $rnd();
        if ($c['artist'] !== '' && !isset($ctx['profile'][$c['artist']])) $s += 0.15; // исполнитель новый для канала
        if (($last[0] ?? null) === $c['src']) $s -= 0.2;
        if (($last[0] ?? null) === $c['src'] && ($last[1] ?? null) === $c['src']) $s -= 0.4;
        $scored[] = [$s, $c];
    }
    usort($scored, fn($a, $b) => $b[0] <=> $a[0]);
    $top = array_slice($scored, 0, 3);
    $r = $rnd();
    $c = $top[min($r < 0.6 ? 0 : ($r < 0.9 ? 1 : 2), count($top) - 1)][1];
    $c['reason'] = music_reason($c);
    return $c;
}

// Ставим в очередь один трек (заказал «авто»). Возвращает false, если подходящего нет — очередь останется пустой.
function music_autofill(array $user): bool {
    $uid = (int)$user['id'];
    $cfg = music_config($uid);
    if (empty($cfg['auto']) || !cfg('YOUTUBE_API_KEY')) return false;
    $mem = music_memory($uid);
    $prof = music_profile($mem);
    $byUser = music_pool($uid);
    $ctx = [
        'cfg' => $cfg, 'mem' => $mem, 'now' => now(), 'profile' => $prof['w'], 'details' => [], 'last' => music_last_sources($mem),
        'rnd' => fn() => mt_rand() / mt_getrandmax(),
        'seeds' => music_seeds($prof), 'byUser' => $byUser,
        'explore' => music_explore($byUser, $prof['w']),
    ];
    $mixKey = is_string($cfg['mix'] ?? null) ? $cfg['mix'] : 'mixed';
    $mix = AUTO_MIX[$mixKey] ?? AUTO_MIX['mixed'];
    // Два круга источников: во втором каждая попытка берёт другого исполнителя или соседа, пул растёт.
    // Чарт — последний запасной вариант. Второй круг идёт только если первый ничего не дал.
    $order = array_merge(music_draw_sources($mix), music_draw_sources($mix), ['chart']);
    $cands = [];
    $pick = null;
    foreach ($order as $src) {
        $items = music_source_items($src, $ctx);
        if (!$items) continue;
        $new = array_diff(array_column($items, 'id'), array_keys($ctx['details']));
        $ctx['details'] += yt_details($new);
        $cands = array_merge($cands, $items);
        $pick = music_pick($cands, $ctx, ['strict']); // сначала строгие правила по всем источникам, которые уже нашли
        if ($pick) break;
    }
    $pick ??= music_pick($cands, $ctx, ['relaxed', 'any', 'last']);
    if (!$pick) {
        logline('auto', 'канал ' . $uid . ': подходящего трека для автоподбора нет');
        return false;
    }
    $pos = (int)(db_one("SELECT MAX(pos) AS m FROM songs WHERE user_id = ? AND status = 'queued'", [$uid])['m'] ?? 0) + 1;
    db_insert('songs', [
        'user_id' => $uid, 'video_id' => $pick['id'], 'url' => 'https://youtu.be/' . $pick['id'], 'source' => 'YouTube', 'title' => $pick['title'],
        'duration' => $pick['duration'], 'requester' => 'авто · ' . $pick['reason'], 'method' => 'auto_' . $pick['src'],
        'status' => 'queued', 'pos' => $pos, 'created_at' => now(),
    ]);
    return true;
}
