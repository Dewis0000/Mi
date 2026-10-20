<?php
// Фоновые задачи StreOps. Запускаются сами: от запросов панели и виджетов OBS, от сообщений чата и от cron (если он есть).
// Каждая задача срабатывает не чаще своего интервала: интервал «занимается» атомарно в таблице cooldowns,
// поэтому параллельные запросы не запускают одну задачу дважды.

function job_claim(string $key, int $everySec): bool {
    $now = now();
    if (db_exec('UPDATE cooldowns SET last = ? WHERE k = ? AND last < ?', [$now, $key, $now - $everySec])) return true;
    if (db_one('SELECT k FROM cooldowns WHERE k = ?', [$key])) return false;
    try { db_insert('cooldowns', ['k' => $key, 'last' => $now]); return true; }
    catch (Throwable $e) { return false; }
}

function job_step(string $name, callable $fn): void {
    try { $fn(); } catch (Throwable $e) { logline('jobs', "$name: " . $e->getMessage()); }
}

// Статус стримов и зрители (Twitch) — каждые 15 с
function job_streams(): void {
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
                db_insert('stream_samples', ['user_id' => $u['id'], 'ts' => now(), 'viewers' => (int)$s['viewer_count']]);
                db_exec('DELETE FROM stream_samples WHERE ts < ?', [now() - 3 * 86400]);
            } elseif ($row && (int)$row['live']) {
                db_exec('UPDATE streams SET live = 0, updated_at = ? WHERE user_id = ?', [now(), $u['id']]);
            }
        }
    }
}


// Таймеры сообщений в чат — каждые 3 с: отправляем, когда пришло время (для «только в эфире» — если стрим идёт)
// Таймеры сообщений в чат: отправляем, когда пришло время (и если стрим идёт, для «только в эфире»)
function job_timers(): void {
    foreach (db_all("SELECT u.* FROM users u JOIN settings s ON s.user_id = u.id AND s.skey = 'timers' WHERE u.bot_enabled = 1 AND u.banned = 0") as $u) {
        $raw = settings_get((int)$u['id'], 'timers', []);
        if (!is_array($raw) || !$raw) continue;
        $live = (bool)(db_one('SELECT live FROM streams WHERE user_id = ?', [$u['id']])['live'] ?? false);
        $changed = false;
        foreach ($raw as &$t) {
            if (empty($t['on']) || (!empty($t['liveOnly']) && !$live) || now() - (int)($t['last'] ?? 0) < (int)$t['every'] * 60) continue;
            tw_send($u['twitch_id'], render_vars((string)$t['text'], $u, ['name' => $u['display_name'] ?: $u['login']], 0));
            $t['last'] = now();
            $changed = true;
        }
        unset($t);
        if ($changed) settings_set((int)$u['id'], 'timers', $raw);
    }
}


// Донаты DonationAlerts, розыгрыши с таймером, тарифы, EventSub, очистка
function jobs_fast(): void {
    if (job_claim('job:timers', 3)) job_step('timers', 'job_timers');
    if (job_claim('job:donations', 3)) job_step('donations', function () {
        foreach (db_all('SELECT * FROM users WHERE da_access IS NOT NULL AND banned = 0') as $u) da_poll($u);
    });
    if (job_claim('job:giveaways', 3)) job_step('giveaways', function () {
        db_exec("UPDATE giveaways SET status = 'closed' WHERE status = 'collecting' AND ends_at > 0 AND ends_at < ?", [now()]);
    });
    if (job_claim('job:streams', 15)) job_step('streams', 'job_streams');
    if (job_claim('job:plans', 60)) job_step('plans', function () {
        db_exec("UPDATE users SET plan = 'free', plan_until = 0 WHERE plan <> 'free' AND plan_until > 0 AND plan_until < ?", [now()]);
    });
    if (job_claim('job:eventsub', 900)) job_step('eventsub', function () {
        $b = bot_account();
        if (!$b || empty($b['own_app'])) return;
        $existing = eventsub_list();
        foreach (db_all('SELECT * FROM users WHERE bot_enabled = 1 AND banned = 0') as $u) {
            $err = eventsub_ensure_channel($u, $existing);
            db_update('users', ['bot_error' => $err ? implode('; ', $err) : null], 'id = ?', [$u['id']]);
        }
    });
    if (job_claim('job:cleanup', 3600)) job_step('cleanup', function () {
        db_exec('DELETE FROM chat_messages WHERE created_at < ?', [now() - 30 * 86400]);
        db_exec('DELETE FROM eventsub_seen WHERE created_at < ?', [now() - 2 * 86400]);
        db_exec('DELETE FROM kv WHERE expires > 0 AND expires < ?', [now()]);
    });
}
