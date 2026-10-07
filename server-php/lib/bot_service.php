<?php
/**
 * Связь сайта с внешним бот-сервисом (Cloudflare Worker).
 * Если в config.php задан bot_service_url — коды входа и уведомления идут через
 * него (боты живут отдельно и всегда доступны). Если не задан — работает прежняя
 * локальная логика (webhook/cron на самом сайте).
 */
declare(strict_types=1);

function bs_enabled(): bool {
    return trim((string)cfg('bot_service_url', '')) !== '';
}

function bs_call(string $path, array $body): array {
    $url = rtrim((string)cfg('bot_service_url', ''), '/') . $path;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . (string)cfg('bot_service_secret', ''), 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE),
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_CONNECTTIMEOUT => 6,
    ]);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $j = is_string($resp) ? json_decode($resp, true) : null;
    return ['ok' => $code >= 200 && $code < 300, 'status' => $code, 'body' => is_array($j) ? $j : []];
}

/** Запросить код входа через бот-сервис. Возвращает ['delivered','needsMessenger','botUrl','channel']. */
function bs_request_code(string $phone, string $channel): array {
    $r = bs_call('/api/request-code', ['phone' => $phone, 'channel' => $channel]);
    $b = $r['body'];
    return [
        'delivered'     => !empty($b['delivered']),
        'needsMessenger'=> !empty($b['needsMessenger']) || empty($b['delivered']),
        'botUrl'        => $b['botUrl'] ?? null,
        'channel'       => $b['channel'] ?? 'telegram',
        'ok'            => $r['ok'],
    ];
}

/** Проверить код входа через бот-сервис. */
function bs_verify_code(string $phone, string $code): bool {
    $r = bs_call('/api/verify-code', ['phone' => $phone, 'code' => $code]);
    return $r['ok'] && !empty($r['body']['ok']);
}

/** Отправить произвольное сообщение на номер (если он привязан к боту). */
function bs_send(string $phone, string $text): bool {
    $r = bs_call('/api/send', ['phone' => $phone, 'text' => $text]);
    return $r['ok'] && !empty($r['body']['ok']);
}
