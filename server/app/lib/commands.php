<?php
// Команды чата: стартовые, базовые (встроенные) и пользовательские. Здесь общие правила имён, синонимов и занятых слов.

const COMMAND_PREFIXES = ['!', '?', ''];
const COMMAND_MAX_ALIASES = 5;
const COMMAND_NAME_MAX = 40;
const BUILTIN_ACCESS = ['all', 'followers', 'subs', 'vip', 'mods'];

// Стартовые команды: создаются при первом входе, а если их удалили, возвращаются кнопкой «Вернуть стартовые»
function starter_commands(): array {
    return [
        ['name' => 'аптайм', 'response' => 'Аптайм: {uptime}', 'desc' => 'Сколько идёт стрим', 'cooldown' => 10],
        ['name' => 'команды', 'response' => 'Команды канала: {commands}', 'desc' => 'Список команд', 'cooldown' => 30],
        ['name' => 'время', 'response' => 'Сейчас {time}', 'desc' => 'Текущее время', 'cooldown' => 10],
    ];
}

// Добавляет стартовые команды, которых у канала нет (сверка по названию). Возвращает, сколько добавили
function commands_seed(int $uid, int $limit = PHP_INT_MAX): int {
    $have = array_column(db_all("SELECT name FROM commands WHERE user_id = ? AND prefix = '!'", [$uid]), 'name');
    $total = (int)db_one('SELECT COUNT(*) c FROM commands WHERE user_id = ?', [$uid])['c'];
    $added = 0;
    foreach (starter_commands() as $s) {
        if (in_array($s['name'], $have, true)) continue;
        if ($total + $added >= $limit) break;
        db_insert('commands', ['user_id' => $uid, 'name' => $s['name'], 'prefix' => '!', 'response' => $s['response'], 'description' => $s['desc'],
            'cooldown_global' => $s['cooldown'], 'enabled' => 1, 'access' => 'all', 'created_at' => now()]);
        $added++;
    }
    return $added;
}

// Базовые команды: встроенные, работают всегда. Их можно выключить, а у двух — выбрать, кто может вызвать.
// name — основное слово, aliases — синонимы; все вызываются с «!».
function builtin_defs(): array {
    return [
        'song' => ['name' => 'трек', 'aliases' => ['song', 'песня'], 'title' => 'Что сейчас играет',
            'desc' => 'Называет трек и того, кто его заказал.', 'access' => 'all', 'editable' => true],
        'queue' => ['name' => 'очередь', 'aliases' => ['queue'], 'title' => 'Очередь треков',
            'desc' => 'Показывает три следующих трека.', 'access' => 'all', 'editable' => true],
        'skip' => ['name' => 'скип', 'aliases' => ['skip', 'пропустить'], 'title' => 'Пропустить трек',
            'desc' => 'Пропускает текущий трек. Только модераторы.', 'access' => 'mods', 'editable' => false],
        'permit' => ['name' => 'permit', 'aliases' => [], 'title' => 'Разрешить ссылку',
            'desc' => 'Разрешает одному зрителю отправить ссылку на минуту. Работает, если включена защита от ссылок.', 'access' => 'mods', 'editable' => false],
    ];
}

// Настройки базовых команд канала: включена ли и кто может вызвать. Не сохранённое берём из значений по умолчанию
function builtin_config(int $uid): array {
    $saved = settings_get($uid, 'builtins', []);
    $saved = is_array($saved) ? $saved : [];
    $out = [];
    foreach (builtin_defs() as $key => $d) {
        $s = is_array($saved[$key] ?? null) ? $saved[$key] : [];
        $access = in_array($s['access'] ?? '', BUILTIN_ACCESS, true) ? $s['access'] : $d['access'];
        $out[$key] = ['on' => !array_key_exists('on', $s) || (bool)$s['on'], 'access' => $d['editable'] ? $access : $d['access']];
    }
    return $out;
}

// Все слова, которыми вызывается базовая команда, с «!»
function builtin_triggers(string $key): array {
    $d = builtin_defs()[$key];
    return array_map(fn($n) => '!' . $n, array_merge([$d['name']], $d['aliases']));
}

// Настройки базовой команды, если она включена и сообщение — её слово; иначе null
function builtin_match(array $cfg, string $key, string $word): ?array {
    if (empty($cfg[$key]['on'])) return null;
    return in_array($word, builtin_triggers($key), true) ? $cfg[$key] : null;
}

// Синонимы из строки «дс, discord»: без префикса, в нижнем регистре, без пробелов и повторов, без основного имени
function command_aliases(string $raw, string $name): array {
    $out = [];
    foreach (explode(',', mb_strtolower($raw)) as $a) {
        $a = preg_replace('/\s+/u', '', ltrim(trim($a), '!'));
        if ($a === '' || $a === $name || in_array($a, $out, true)) continue;
        $out[] = $a;
    }
    return $out;
}

// Слова команды с префиксом в нижнем регистре: сначала основное имя, потом синонимы
function command_triggers(array $c): array {
    $names = array_merge([(string)$c['name']], array_values(array_filter(array_map('trim', explode(',', (string)($c['aliases'] ?? ''))), fn($a) => $a !== '')));
    return array_map(fn($n) => mb_strtolower($c['prefix'] . $n), $names);
}

// Какое слово из сообщения вызвало команду (в нижнем регистре) или null. Без префикса — только точное совпадение
function command_hit(array $c, string $low): ?string {
    foreach (command_triggers($c) as $t) {
        $ok = $c['prefix'] === '' ? $low === $t : ($low === $t || str_starts_with($low, $t . ' '));
        if ($ok) return $t;
    }
    return null;
}

// Слова, которые заняты встроенными командами, заказом музыки и счётчиками. Свою команду с таким словом не создать
function reserved_triggers(array $user): array {
    $out = [];
    foreach (array_keys(builtin_defs()) as $key) $out = array_merge($out, builtin_triggers($key));
    $m = music_config((int)$user['id']);
    if (!empty($m['cmd']['on'])) $out[] = '!' . mb_strtolower((string)$m['cmd']['name']);
    foreach (counters_defs($user) as $c) $out[] = mb_strtolower((string)$c['command']);
    return $out;
}

// Причина, почему слова нельзя взять для команды (или null, если можно). $words — основное имя и синонимы
function command_conflict(array $user, int $selfId, string $prefix, array $words): ?string {
    $reserved = reserved_triggers($user);
    $others = db_all('SELECT id, prefix, name, aliases FROM commands WHERE user_id = ? AND id <> ?', [(int)$user['id'], $selfId]);
    foreach ($words as $w) {
        $t = mb_strtolower($prefix . $w);
        if (in_array($t, $reserved, true)) return 'Слово ' . $t . ' занято встроенной командой';
        foreach ($others as $o) {
            if (in_array($t, command_triggers($o), true)) return 'Команда ' . $t . ' уже есть';
        }
    }
    return null;
}
