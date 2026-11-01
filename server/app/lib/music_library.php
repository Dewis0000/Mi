<?php
// Своя музыка канала — запасной плеер, когда YouTube у плеера не открывается. Файлы стримера лежат вне веб-корня
// (APP_DIR/storage/library/<канал>/) и отдаются только по токену плеера (w/media.php). Места хватает по тарифу.

const LIB_MAX_FILE = 25 * 1024 * 1024;
const LIB_QUOTA = ['pro' => 500 * 1024 * 1024, 'max' => 2048 * 1024 * 1024];
const LIB_EXT = ['mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'ogg' => 'audio/ogg', 'oga' => 'audio/ogg', 'opus' => 'audio/ogg', 'wav' => 'audio/wav', 'flac' => 'audio/flac'];

function lib_quota(array $user): int {
    return LIB_QUOTA[plan_limits($user)['key']] ?? 0;
}

function lib_used(int $uid): int {
    return (int)db_one('SELECT COALESCE(SUM(size), 0) s FROM music_library WHERE user_id = ?', [$uid])['s'];
}

function lib_dir(int $uid): string {
    $dir = APP_DIR . '/storage/library/' . $uid;
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    return $dir;
}

function lib_upload_error(int $code): string {
    return match ($code) {
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Файл больше, чем разрешает сервер. Сожми его или возьми mp3 на 192 kbps',
        UPLOAD_ERR_NO_FILE => 'Выбери файл',
        default => 'Файл не загрузился, попробуй ещё раз',
    };
}

// Тип файла по содержимому. Без расширения fileinfo не определить — тогда проверяем только имя
function lib_mime(string $path): ?string {
    if (!function_exists('finfo_open')) return null;
    $f = finfo_open(FILEINFO_MIME_TYPE);
    $m = $f ? finfo_file($f, $path) : false;
    return $m ? (string)$m : null;
}

// Сигнатура аудио по первым байтам: если libmagic формат не знает, заголовок всё равно скажет, что это музыка
function lib_signature_ok(string $path): bool {
    $h = (string)file_get_contents($path, false, null, 0, 12);
    if (str_starts_with($h, 'ID3') || str_starts_with($h, 'OggS') || str_starts_with($h, 'fLaC')) return true;
    if (str_starts_with($h, 'RIFF') && substr($h, 8, 4) === 'WAVE') return true;
    if (strlen($h) >= 8 && substr($h, 4, 4) === 'ftyp') return true; // m4a и mp4-контейнер
    return strlen($h) >= 2 && ord($h[0]) === 0xFF && (ord($h[1]) & 0xE0) === 0xE0; // кадр mp3 или aac без тега
}

// Сохраняем загруженный файл. $f — элемент $_FILES, $by — кто загрузил (для журнала)
function lib_store(array $user, array $f, string $title, int $duration, string $by): int {
    $uid = (int)$user['id'];
    if (!plan_limits($user)['music']) fail('Своя музыка доступна на тарифе «Про» и выше');
    $quota = lib_quota($user);
    if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) fail(lib_upload_error((int)($f['error'] ?? UPLOAD_ERR_NO_FILE)));
    $size = (int)($f['size'] ?? 0);
    if ($size <= 0) fail('Файл пустой');
    if ($size > LIB_MAX_FILE) fail('Файл больше 25 МБ. Сожми его или возьми mp3 на 192 kbps');
    if ($size + lib_used($uid) > $quota) fail('Не хватает места: на тарифе «' . plan_limits($user)['name'] . '» своей музыки до ' . (int)($quota / 1048576) . ' МБ. Удали ненужное');
    $name = (string)($f['name'] ?? '');
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!isset(LIB_EXT[$ext])) fail('Формат не подходит: нужен mp3, m4a, ogg, opus, wav или flac');
    $tmp = (string)($f['tmp_name'] ?? '');
    if ($tmp === '' || !is_uploaded_file($tmp)) fail('Файл не загрузился, попробуй ещё раз');
    $mime = lib_mime($tmp);
    $mimeOk = $mime !== null && (str_starts_with($mime, 'audio/') || in_array($mime, ['video/mp4', 'application/ogg'], true));
    if (!$mimeOk && !lib_signature_ok($tmp)) fail('Это не аудиофайл: содержимое не похоже на музыку');
    $file = rand_token(12) . '.' . $ext;
    if (!move_uploaded_file($tmp, lib_dir($uid) . '/' . $file)) fail('Не удалось сохранить файл на сервере');
    $title = trim($title) !== '' ? trim($title) : trim(pathinfo($name, PATHINFO_FILENAME));
    return db_insert('music_library', [
        'user_id' => $uid, 'title' => mb_substr($title, 0, 300), 'file' => $file, 'mime' => LIB_EXT[$ext], 'size' => $size,
        'duration' => max(0, min(5 * 3600, $duration)), 'uploaded_by' => mb_substr($by, 0, 64), 'created_at' => now(),
    ]);
}

// Файлы канала, новее первых
function lib_list(int $uid): array {
    return array_map(fn($r) => [
        'id' => (int)$r['id'], 'title' => (string)$r['title'], 'duration' => (int)$r['duration'], 'size' => (int)$r['size'],
        'by' => (string)$r['uploaded_by'], 'at' => (int)$r['created_at'],
    ], db_all('SELECT * FROM music_library WHERE user_id = ? ORDER BY id DESC', [$uid]));
}

function lib_delete(int $uid, int $id): void {
    $r = db_one('SELECT * FROM music_library WHERE id = ? AND user_id = ?', [$id, $uid]) ?? fail('Файл не найден', 404);
    $path = lib_dir($uid) . '/' . $r['file'];
    if (is_file($path)) @unlink($path);
    db_exec('DELETE FROM music_library WHERE id = ? AND user_id = ?', [$id, $uid]);
}

// Адрес файла для плеера: токен плеера даёт доступ, без него файл не отдаётся
function lib_url(array $user, int $id): string {
    return '/w/media.php?t=' . rawurlencode((string)$user['widget_token']) . '&id=' . $id;
}

// Файл, который совпадает с песней очереди (по ключу песни из music_split), или null
function lib_match(int $uid, string $title): ?array {
    $key = music_split($title)['key'];
    if ($key === '') return null;
    foreach (db_all('SELECT * FROM music_library WHERE user_id = ? ORDER BY id DESC', [$uid]) as $r) {
        if (music_split((string)$r['title'])['key'] === $key) return $r;
    }
    return null;
}

// Запасной эфир: случайный файл, который недавно не играл. Последние три запоминаем в kv.
function lib_filler(array $user): ?array {
    $uid = (int)$user['id'];
    $rows = db_all('SELECT * FROM music_library WHERE user_id = ?', [$uid]);
    if (!$rows) return null;
    $recent = kv_get('lib:recent:' . $uid);
    $recent = is_array($recent) ? $recent : [];
    $pool = array_values(array_filter($rows, fn($r) => !in_array((int)$r['id'], $recent, true)));
    $pick = $pool ? $pool[array_rand($pool)] : $rows[array_rand($rows)];
    $recent = array_slice(array_merge([(int)$pick['id']], $recent), 0, 3);
    kv_set('lib:recent:' . $uid, $recent, 6 * 3600);
    return $pick;
}

// Строка файла для плеера: название, адрес и длительность
function lib_view(array $user, array $r): array {
    return ['id' => (int)$r['id'], 'title' => (string)$r['title'], 'duration' => (int)$r['duration'], 'url' => lib_url($user, (int)$r['id'])];
}
