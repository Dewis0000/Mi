<?php
// DonationAlerts: OAuth-подключение стримера и опрос новых донатов (cron).
// Нужно OAuth-приложение DonationAlerts: DA_CLIENT_ID и DA_CLIENT_SECRET в .env.

function da_redirect(): string { return base_url() . '/auth/da.php'; }

function da_auth_url(string $state): string {
    return 'https://www.donationalerts.com/oauth/authorize?' . http_build_query([
        'client_id' => cfg('DA_CLIENT_ID'), 'redirect_uri' => da_redirect(), 'response_type' => 'code',
        'scope' => 'oauth-user-show oauth-donation-index', 'state' => $state,
    ]);
}

function da_token(array $fields): ?array {
    $r = http_form('https://www.donationalerts.com/oauth/token', $fields + ['client_id' => cfg('DA_CLIENT_ID'), 'client_secret' => cfg('DA_CLIENT_SECRET')]);
    return $r['code'] === 200 ? $r['json'] : null;
}

function da_access(array &$user): ?string {
    if (!$user['da_access']) return null;
    if ((int)$user['da_expires'] > now() + 300) return $user['da_access'];
    $t = da_token(['grant_type' => 'refresh_token', 'refresh_token' => $user['da_refresh'], 'scope' => 'oauth-user-show oauth-donation-index']);
    if (!$t) return null;
    $user['da_access'] = $t['access_token'];
    $user['da_refresh'] = $t['refresh_token'] ?? $user['da_refresh'];
    $user['da_expires'] = now() + (int)($t['expires_in'] ?? 3600);
    db_update('users', ['da_access' => $user['da_access'], 'da_refresh' => $user['da_refresh'], 'da_expires' => $user['da_expires']], 'id = ?', [$user['id']]);
    return $user['da_access'];
}

// Забрать новые донаты. Возвращает количество новых.
function da_poll(array $user): int {
    $token = da_access($user);
    if (!$token) return 0;
    $r = http_request('GET', 'https://www.donationalerts.com/api/v1/alerts/donations', ['Authorization' => 'Bearer ' . $token]);
    if ($r['code'] !== 200) { logline('da', $user['login'] . ' poll ' . $r['code'] . ' ' . substr($r['raw'], 0, 200)); return 0; }
    $new = 0;
    $lastId = (int)$user['da_last_id'];
    $maxId = $lastId;
    foreach (array_reverse($r['json']['data'] ?? []) as $d) {
        $id = (int)$d['id'];
        if ($id <= $lastId) continue;
        $maxId = max($maxId, $id);
        $amount = (int)round((float)($d['amount_in_user_currency'] ?? $d['amount'] ?? 0));
        try {
            db_insert('donations', [
                'user_id' => $user['id'], 'ext_id' => 'da' . $id, 'username' => mb_substr((string)($d['username'] ?? 'Аноним'), 0, 120),
                'amount' => $amount, 'currency' => $d['currency'] ?? 'RUB', 'message' => mb_substr((string)($d['message'] ?? ''), 0, 500),
                'created_at' => strtotime((string)($d['created_at'] ?? 'now')) ?: now(),
            ]);
        } catch (Throwable $e) { continue; }
        db_insert('events', ['user_id' => $user['id'], 'type' => 'donation', 'login' => $d['username'] ?? '', 'name' => $d['username'] ?? '',
            'data' => json_encode(['amount' => $amount, 'currency' => $d['currency'] ?? 'RUB', 'message' => $d['message'] ?? ''], JSON_UNESCAPED_UNICODE), 'created_at' => now()]);
        $new++;
        // заказ трека через донат
        bot_on_donation($user, (string)($d['username'] ?? ''), $amount, (string)($d['message'] ?? ''));
    }
    if ($maxId > $lastId) db_update('users', ['da_last_id' => $maxId], 'id = ?', [$user['id']]);
    return $new;
}
