<?php
// Уведомления оператору в Telegram и MAX. Любые ошибки логируются и НЕ ломают оформление заявки.

/** Низкоуровневый POST. $json=true — тело JSON, иначе form-urlencoded. Возвращает [httpCode, body, err]. */
function http_post(string $url, $data, bool $json = false, int $timeout = 8): array {
    $ch = curl_init($url);
    $headers = [];
    if ($json) {
        $body = json_encode($data, JSON_UNESCAPED_UNICODE);
        $headers[] = 'Content-Type: application/json';
    } else {
        $body = http_build_query($data);
        $headers[] = 'Content-Type: application/x-www-form-urlencoded';
    }
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => $timeout,
    ]);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    return [$code, (string)$resp, $err];
}

function tg_send(string $token, string $chatId, string $text): bool {
    if ($token === '' || $chatId === '') return false;
    $url = "https://api.telegram.org/bot{$token}/sendMessage";
    [$code, $resp, $err] = http_post($url, [
        'chat_id' => $chatId,
        'text'    => $text,
        'disable_web_page_preview' => 'true',
    ]);
    if ($code !== 200) {
        error_log("[nery-notify] telegram chat={$chatId} http={$code} err={$err} resp=" . substr($resp, 0, 300));
        return false;
    }
    return true;
}

function max_send(string $apiBase, string $token, string $chatId, string $text): bool {
    if ($token === '' || $chatId === '') return false;
    $base = rtrim($apiBase, '/');
    $url = "{$base}/messages?access_token=" . urlencode($token) . '&chat_id=' . urlencode($chatId);
    [$code, $resp, $err] = http_post($url, ['text' => $text], true);
    if ($code < 200 || $code >= 300) {
        error_log("[nery-notify] max chat={$chatId} http={$code} err={$err} resp=" . substr($resp, 0, 300));
        return false;
    }
    return true;
}

/** Разослать текст по всем настроенным каналам. Возвращает true, если хотя бы одно сообщение ушло. */
function notify_operators(array $cfg, string $text): bool {
    $ok = false;

    $tg = $cfg['telegram'] ?? [];
    if (!empty($tg['enabled']) && !empty($tg['bot_token'])) {
        foreach (($tg['chat_ids'] ?? []) as $cid) {
            $ok = tg_send($tg['bot_token'], (string)$cid, $text) || $ok;
        }
    }

    $mx = $cfg['max'] ?? [];
    if (!empty($mx['enabled']) && !empty($mx['bot_token'])) {
        $base = $mx['api_base'] ?? 'https://botapi.max.ru';
        foreach (($mx['chat_ids'] ?? []) as $cid) {
            $ok = max_send($base, $mx['bot_token'], (string)$cid, $text) || $ok;
        }
    }

    return $ok;
}
