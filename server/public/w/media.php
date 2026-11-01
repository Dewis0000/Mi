<?php
// Своя музыка для запасного плеера: /w/media.php?t=ТОКЕН&id=ФАЙЛ. Файл отдаётся только по токену плеера канала
// и только его файл. Поддерживается перемотка (Range), потому что источник «Браузер» в OBS и плеер в браузере просят куски.
require __DIR__ . '/../_app.php';

$u = db_one('SELECT * FROM users WHERE widget_token = ?', [(string)($_GET['t'] ?? '')]);
if (!$u || (int)$u['banned']) { http_response_code(404); exit; }
$row = db_one('SELECT * FROM music_library WHERE id = ? AND user_id = ?', [(int)($_GET['id'] ?? 0), $u['id']]);
$path = $row ? APP_DIR . '/storage/library/' . (int)$u['id'] . '/' . $row['file'] : '';
if (!$row || !is_file($path)) { http_response_code(404); exit; }

$size = (int)filesize($path);
$start = 0;
$end = $size - 1;
$status = 200;
if (isset($_SERVER['HTTP_RANGE']) && preg_match('~^bytes=(\d*)-(\d*)$~', trim((string)$_SERVER['HTTP_RANGE']), $m) && $size > 0) {
    if ($m[1] === '' && $m[2] !== '') {
        $start = max(0, $size - (int)$m[2]); // последние N байт
    } else {
        $start = (int)$m[1];
        if ($m[2] !== '') $end = min($end, (int)$m[2]);
    }
    if ($start > $end || $start >= $size) {
        header('Content-Range: bytes */' . $size);
        http_response_code(416);
        exit;
    }
    $status = 206;
}

http_response_code($status);
header('Content-Type: ' . $row['mime']);
header('Content-Length: ' . ($end - $start + 1));
header('Accept-Ranges: bytes');
header('Cache-Control: private, max-age=3600');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex');
if ($status === 206) header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);

$fp = fopen($path, 'rb');
fseek($fp, $start);
$left = $end - $start + 1;
while ($left > 0 && !feof($fp)) {
    $chunk = fread($fp, min(65536, $left));
    if ($chunk === false) break;
    echo $chunk;
    $left -= strlen($chunk);
}
fclose($fp);
