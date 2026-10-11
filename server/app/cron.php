<?php
// Необязательный cron: ISPmanager → Планировщик → каждую минуту. Без него всё тоже работает:
// задачи запускаются от запросов панели, виджетов и чата (см. lib/jobs.php).
require __DIR__ . '/bootstrap.php';
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
$lock = fopen(APP_DIR . '/cron.lock', 'c');
if (!flock($lock, LOCK_EX | LOCK_NB)) exit;
kv_set('cron_last', now());
$started = time();
while (time() - $started < 58) { // внутри минуты опрашиваем быстрые задачи; повторные запуски им не страшны
    jobs_fast();
    usleep(3000000);
}
echo "ok\n";
