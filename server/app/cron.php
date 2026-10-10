<?php
// Фоновые задачи. Запускать раз в минуту: php ~/streops-app/cron.php
require __DIR__ . '/bootstrap.php';
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
$lock = fopen(APP_DIR . '/cron.lock', 'c');
if (!flock($lock, LOCK_EX | LOCK_NB)) exit;
kv_set('cron_last', now());
// cron в ISPmanager запускается раз в минуту, а внутри работаем ~58 с, опрашивая быстрые источники
$started = time();
$minute = (int)date('i');

function step(string $name, callable $fn): void {
    try { $fn(); } catch (Throwable $e) { logline('cron', "$name: " . $e->getMessage()); }
}

// 1. Статус стримов и зрители (Twitch) — каждые 15 с
$lastStreams = 0;
function cron_streams(): void {

    $users = db_all('SELECT id, twitch_id FROM users WHERE bot_enabled = 1 AND banned = 0');
    foreach (array_chunk($users, 100) as $chunk) {
        $r = helix('GET', 'streams', ['user_id' => array_column($chunk, 'twitch_id'), 'first' => 100]);
        if ($r['code'] !== 200) continue;
        $live = [];
        foreach ($r['json']['data'] ?? [] as $s) $live[$s['user_id']] = $s;
        foreach ($chunk as $u) {
            $s = $live[$u['twitch_id']] ?? null;
            $row = db_one('SELECT * FROM streams WHERE user_id = ?', [$u['id']]);
            if ($s) {
                $started = strtotime($s['started_at']) ?: now();
                $peak = ($row && (int)$row['started_at'] === $started) ? max((int)$row['peak'], (int)$s['viewer_count']) : (int)$s['viewer_count'];
                db_exec('DELETE FROM streams WHERE user_id = ?', [$u['id']]);
                db_insert('streams', ['user_id' => $u['id'], 'live' => 1, 'started_at' => $started, 'viewers' => (int)$s['viewer_count'], 'peak' => $peak,
                    'title' => $s['title'], 'game' => $s['game_name'], 'thumbnail' => $s['thumbnail_url'], 'updated_at' => now()]);
            } elseif ($row && (int)$row['live']) {
                db_exec('UPDATE streams SET live = 0, updated_at = ? WHERE user_id = ?', [now(), $u['id']]);
            }
        }
    }
}

// 2. Донаты DonationAlerts — каждые 3 с
// 4. Розыгрыши с таймером — каждые 3 с
function cron_fast(): void {
    step('donations', function () {
        foreach (db_all('SELECT * FROM users WHERE da_access IS NOT NULL AND banned = 0') as $u) da_poll($u);
    });
    step('giveaways', function () {
        db_exec("UPDATE giveaways SET status = 'closed' WHERE status = 'collecting' AND ends_at > 0 AND ends_at < ?", [now()]);
    });
}

$firstPass = true;
while (time() - $started < 58) {
    if (time() - $lastStreams >= 15) { step('streams', 'cron_streams'); $lastStreams = time(); }
    cron_fast();
    $firstPass = false;
    usleep(3000000);
}

// 3. Окончание платных тарифов — раз в минуту
step('plans', function () {
    db_exec("UPDATE users SET plan = 'free', plan_until = 0 WHERE plan <> 'free' AND plan_until > 0 AND plan_until < ?", [now()]);
});

// 5. Раз в 15 минут — проверить подписки EventSub, раз в час — почистить старое
if ($minute % 15 === 0 && $firstPass) step('eventsub', function () {
    $b = bot_account();
    if (!$b || empty($b['own_app'])) return;
    $existing = eventsub_list();
    foreach (db_all('SELECT * FROM users WHERE bot_enabled = 1 AND banned = 0') as $u) {
        $err = eventsub_ensure_channel($u, $existing);
        db_update('users', ['bot_error' => $err ? implode('; ', $err) : null], 'id = ?', [$u['id']]);
    }
});
if ($minute === 7 && $firstPass) step('cleanup', function () {
    db_exec('DELETE FROM chat_messages WHERE created_at < ?', [now() - 30 * 86400]);
    db_exec('DELETE FROM eventsub_seen WHERE created_at < ?', [now() - 2 * 86400]);
    db_exec('DELETE FROM cooldowns WHERE last < ?', [now() - 2 * 86400]);
    db_exec('DELETE FROM kv WHERE expires > 0 AND expires < ?', [now()]);
});
echo "ok\n";
