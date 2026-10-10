<?php
// Twitch: OAuth, токены приложения/пользователей/бота, Helix API, EventSub.

const TW_STREAMER_SCOPES = 'channel:bot channel:manage:moderators moderator:read:followers channel:read:subscriptions channel:manage:redemptions channel:read:redemptions';
const TW_BOT_SCOPES = 'user:read:chat user:write:chat user:bot moderator:manage:chat_messages moderator:manage:banned_users moderator:manage:chat_settings moderator:manage:shield_mode moderator:read:followers moderator:read:chatters moderator:read:blocked_terms moderator:read:chat_settings moderator:read:unban_requests moderator:manage:unban_requests moderator:read:banned_users moderator:read:chat_messages moderator:read:warnings moderator:read:moderators moderator:read:vips';

function tw_client_id(): string { return (string)cfg('TWITCH_CLIENT_ID'); }

function tw_auth_url(string $scopes, string $state, bool $forceVerify = false): string {
    return 'https://id.twitch.tv/oauth2/authorize?' . http_build_query([
        'client_id' => tw_client_id(),
        'redirect_uri' => base_url() . '/auth/callback.php',
        'response_type' => 'code',
        'scope' => $scopes,
        'state' => $state,
        'force_verify' => $forceVerify ? 'true' : 'false',
    ]);
}

function tw_exchange_code(string $code): ?array {
    $r = http_form('https://id.twitch.tv/oauth2/token', [
        'client_id' => tw_client_id(),
        'client_secret' => cfg('TWITCH_CLIENT_SECRET'),
        'code' => $code,
        'grant_type' => 'authorization_code',
        'redirect_uri' => base_url() . '/auth/callback.php',
    ]);
    return $r['code'] === 200 ? $r['json'] : null;
}

function tw_refresh(string $refresh): ?array {
    $r = http_form('https://id.twitch.tv/oauth2/token', [
        'client_id' => tw_client_id(),
        'client_secret' => cfg('TWITCH_CLIENT_SECRET'),
        'refresh_token' => $refresh,
        'grant_type' => 'refresh_token',
    ]);
    return $r['code'] === 200 ? $r['json'] : null;
}

function tw_validate(string $token): ?array {
    $r = http_request('GET', 'https://id.twitch.tv/oauth2/validate', ['Authorization' => 'OAuth ' . $token]);
    return $r['code'] === 200 ? $r['json'] : null;
}

// Токен приложения (client credentials) — для EventSub и публичных запросов.
function tw_app_token(bool $force = false): ?string {
    if (!$force && ($t = kv_get('tw_app_token'))) return $t;
    $r = http_form('https://id.twitch.tv/oauth2/token', [
        'client_id' => tw_client_id(),
        'client_secret' => cfg('TWITCH_CLIENT_SECRET'),
        'grant_type' => 'client_credentials',
    ]);
    if ($r['code'] !== 200) { logline('twitch', 'app token failed: ' . $r['raw']); return null; }
    kv_set('tw_app_token', $r['json']['access_token'], max(60, (int)$r['json']['expires_in'] - 300));
    return $r['json']['access_token'];
}

// Токен пользователя-стримера, с автообновлением.
function tw_user_token(array &$user): ?string {
    if (!$user['access_token']) return null;
    if ((int)$user['token_expires'] > now() + 120) return $user['access_token'];
    if (!$user['refresh_token']) return null;
    $t = tw_refresh($user['refresh_token']);
    if (!$t) { logline('twitch', 'refresh failed for ' . $user['login']); return null; }
    $user['access_token'] = $t['access_token'];
    $user['refresh_token'] = $t['refresh_token'] ?? $user['refresh_token'];
    $user['token_expires'] = now() + (int)($t['expires_in'] ?? 3600);
    db_update('users', ['access_token' => $user['access_token'], 'refresh_token' => $user['refresh_token'], 'token_expires' => $user['token_expires']], 'id = ?', [$user['id']]);
    return $user['access_token'];
}

// Аккаунт бота. Основной вариант — бот авторизовал наше приложение (/auth/bot.php).
// Запасной — токен из .env (выданный другим приложением): им можно только писать и модерировать.
function bot_account(): ?array {
    $b = kv_get('bot_account');
    if ($b && !empty($b['access_token'])) {
        if ((int)$b['expires'] < now() + 120 && !empty($b['refresh_token'])) {
            $t = tw_refresh($b['refresh_token']);
            if ($t) {
                $b['access_token'] = $t['access_token'];
                $b['refresh_token'] = $t['refresh_token'] ?? $b['refresh_token'];
                $b['expires'] = now() + (int)($t['expires_in'] ?? 3600);
                kv_set('bot_account', $b);
            } else {
                logline('twitch', 'bot refresh failed');
            }
        }
        $b['client_id'] = tw_client_id();
        $b['own_app'] = true;
        return $b;
    }
    $envToken = cfg('BOT_ACCESS_TOKEN');
    if ($envToken) {
        $cached = kv_get('bot_env_validated');
        if (!$cached) {
            $v = tw_validate($envToken);
            if (!$v) return null;
            $cached = ['id' => $v['user_id'], 'login' => $v['login'], 'client_id' => $v['client_id'], 'scopes' => $v['scopes'] ?? []];
            kv_set('bot_env_validated', $cached, 3600);
        }
        return ['id' => $cached['id'], 'login' => $cached['login'], 'access_token' => $envToken, 'client_id' => $cached['client_id'], 'scopes' => $cached['scopes'], 'own_app' => false];
    }
    return null;
}

function helix(string $method, string $path, ?array $query = null, ?array $body = null, ?string $token = null, ?string $clientId = null): array {
    $token = $token ?? tw_app_token();
    $url = 'https://api.twitch.tv/helix/' . ltrim($path, '/');
    if ($query) {
        // повторяющиеся параметры: user_id=1&user_id=2
        $parts = [];
        foreach ($query as $k => $v) foreach ((array)$v as $vv) $parts[] = rawurlencode($k) . '=' . rawurlencode((string)$vv);
        $url .= '?' . implode('&', $parts);
    }
    $r = http_request($method, $url, ['Authorization' => 'Bearer ' . $token, 'Client-Id' => $clientId ?? tw_client_id()], $body);
    if ($r['code'] >= 400) logline('twitch', "$method $path → {$r['code']} {$r['raw']}");
    return $r;
}

function bot_helix(string $method, string $path, ?array $query = null, ?array $body = null): array {
    $b = bot_account();
    if (!$b) return ['code' => 0, 'json' => null, 'raw' => 'bot not connected'];
    return helix($method, $path, $query, $body, $b['access_token'], $b['client_id']);
}

// ----- Чат -----
function tw_send(string $broadcasterId, string $text, ?string $replyTo = null): bool {
    $b = bot_account();
    if (!$b) return false;
    $text = mb_substr($text, 0, 490);
    $body = ['broadcaster_id' => $broadcasterId, 'sender_id' => $b['id'], 'message' => $text];
    if ($replyTo) $body['reply_parent_message_id'] = $replyTo;
    $r = bot_helix('POST', 'chat/messages', null, $body);
    return $r['code'] === 200 && !empty($r['json']['data'][0]['is_sent']);
}

function tw_delete_message(string $broadcasterId, string $msgId): bool {
    $b = bot_account();
    if (!$b) return false;
    $r = bot_helix('DELETE', 'moderation/chat', ['broadcaster_id' => $broadcasterId, 'moderator_id' => $b['id'], 'message_id' => $msgId]);
    return $r['code'] === 204;
}

function tw_ban(string $broadcasterId, string $userId, int $duration, string $reason): bool {
    $b = bot_account();
    if (!$b) return false;
    $data = ['user_id' => $userId, 'reason' => mb_substr($reason, 0, 500)];
    if ($duration > 0) $data['duration'] = min(1209600, max(1, $duration));
    $r = bot_helix('POST', 'moderation/bans', ['broadcaster_id' => $broadcasterId, 'moderator_id' => $b['id']], ['data' => $data]);
    return $r['code'] === 200;
}

function tw_unban(string $broadcasterId, string $userId): bool {
    $b = bot_account();
    if (!$b) return false;
    $r = bot_helix('DELETE', 'moderation/bans', ['broadcaster_id' => $broadcasterId, 'moderator_id' => $b['id'], 'user_id' => $userId]);
    return $r['code'] === 204;
}

function tw_chat_settings(string $broadcasterId, array $patch): array {
    $b = bot_account();
    if (!$b) return ['code' => 0];
    return bot_helix('PATCH', 'chat/settings', ['broadcaster_id' => $broadcasterId, 'moderator_id' => $b['id']], $patch);
}

function tw_shield(string $broadcasterId, bool $on): bool {
    $b = bot_account();
    if (!$b) return false;
    $r = bot_helix('PUT', 'moderation/shield_mode', ['broadcaster_id' => $broadcasterId, 'moderator_id' => $b['id']], ['is_active' => $on]);
    return $r['code'] === 200;
}

// Сделать бота модератором канала (нужен скоуп channel:manage:moderators у стримера).
function tw_add_bot_moderator(array &$user): bool {
    $b = bot_account();
    $token = tw_user_token($user);
    if (!$b || !$token) return false;
    $r = helix('POST', 'moderation/moderators', ['broadcaster_id' => $user['twitch_id'], 'user_id' => $b['id']], null, $token);
    return in_array($r['code'], [204, 400], true); // 400 — уже модератор
}

// ----- EventSub -----
function eventsub_callback(): string { return base_url() . '/bot/eventsub.php'; }

function eventsub_secret(): string {
    $s = cfg('EVENTSUB_SECRET');
    if ($s) return $s;
    $s = kv_get('eventsub_secret');
    if (!$s) { $s = rand_token(20); kv_set('eventsub_secret', $s); }
    return $s;
}

function eventsub_subscribe(string $type, string $version, array $condition): array {
    return helix('POST', 'eventsub/subscriptions', null, [
        'type' => $type, 'version' => $version, 'condition' => $condition,
        'transport' => ['method' => 'webhook', 'callback' => eventsub_callback(), 'secret' => eventsub_secret()],
    ]);
}

function eventsub_list(): array {
    $all = [];
    $cursor = null;
    for ($i = 0; $i < 10; $i++) {
        $q = $cursor ? ['after' => $cursor] : null;
        $r = helix('GET', 'eventsub/subscriptions', $q);
        if ($r['code'] !== 200) break;
        $all = array_merge($all, $r['json']['data'] ?? []);
        $cursor = $r['json']['pagination']['cursor'] ?? null;
        if (!$cursor) break;
    }
    return $all;
}

function eventsub_delete(string $id): void { helix('DELETE', 'eventsub/subscriptions', ['id' => $id]); }

// Подписки для одного канала. Возвращает список ошибок (пусто — всё хорошо).
function eventsub_ensure_channel(array $user, ?array $existing = null): array {
    $b = bot_account();
    $errors = [];
    if (!$b || empty($b['own_app'])) return ['Аккаунт бота не подключён к приложению: админ-панель → «Подключить аккаунт бота»'];
    $existing = $existing ?? eventsub_list();
    $bid = $user['twitch_id'];
    $want = [
        ['channel.chat.message', '1', ['broadcaster_user_id' => $bid, 'user_id' => $b['id']]],
        ['channel.chat.notification', '1', ['broadcaster_user_id' => $bid, 'user_id' => $b['id']]],
        ['stream.online', '1', ['broadcaster_user_id' => $bid]],
        ['stream.offline', '1', ['broadcaster_user_id' => $bid]],
        ['channel.follow', '2', ['broadcaster_user_id' => $bid, 'moderator_user_id' => $b['id']]],
        ['channel.channel_points_custom_reward_redemption.add', '1', ['broadcaster_user_id' => $bid]],
        ['channel.moderate', '2', ['broadcaster_user_id' => $bid, 'moderator_user_id' => $b['id']]],
    ];
    foreach ($want as [$type, $ver, $cond]) {
        $found = false;
        foreach ($existing as $s) {
            if ($s['type'] === $type && ($s['condition']['broadcaster_user_id'] ?? '') === $bid && in_array($s['status'], ['enabled', 'webhook_callback_verification_pending'], true)) { $found = true; break; }
        }
        if ($found) continue;
        $r = eventsub_subscribe($type, $ver, $cond);
        if (!in_array($r['code'], [202, 409], true)) {
            $msg = $r['json']['message'] ?? ('код ' . $r['code']);
            // follow и баллы канала необязательны (нет прав/не компаньон) — не считаем это поломкой бота
            if (in_array($type, ['channel.chat.message', 'channel.chat.notification'], true)) $errors[] = $type . ': ' . $msg;
            else logline('eventsub', "optional $type for {$user['login']}: $msg");
        }
    }
    return $errors;
}

function eventsub_remove_channel(array $user): void {
    foreach (eventsub_list() as $s) {
        $c = $s['condition'] ?? [];
        if (($c['broadcaster_user_id'] ?? '') === $user['twitch_id']) eventsub_delete($s['id']);
    }
}

function tw_get_user_by_login(string $login): ?array {
    $r = helix('GET', 'users', ['login' => strtolower($login)]);
    return $r['json']['data'][0] ?? null;
}
