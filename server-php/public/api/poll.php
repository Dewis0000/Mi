<?php
/**
 * Опрос ботов (Telegram + MAX) по расписанию — обходит блокировку входящих
 * webhook-запросов на reg.ru. Запускается cron'ом раз в минуту:
 *   /usr/bin/php /путь/к/сайту/api/poll.php
 * Либо по URL с секретом (если cron умеет только URL):
 *   https://nery-quest.ru/api/poll.php?s=<секрет>
 */
declare(strict_types=1);

$LIB = null;
foreach ([__DIR__ . '/../../lib', __DIR__ . '/../lib'] as $cand) {
    if (is_file($cand . '/bootstrap.php')) { $LIB = $cand; break; }
}
if (!$LIB) { http_response_code(500); echo 'no lib'; exit; }

require $LIB . '/bootstrap.php';
require $LIB . '/notify.php';
require $LIB . '/auth.php';
require $LIB . '/slots.php';
require $LIB . '/bot_service.php';
require $LIB . '/bot.php';

$cli = PHP_SAPI === 'cli';
if (!$cli) {
    $expected = hash_hmac('sha256', 'poll', (string)cfg('app_secret'));
    if (!hash_equals($expected, (string)($_GET['s'] ?? ''))) { http_response_code(403); echo json_encode(['error' => 'forbidden']); exit; }
}

run_poll();

if ($cli) { fwrite(STDOUT, "poll ok\n"); } else { echo json_encode(['ok' => true]); }
