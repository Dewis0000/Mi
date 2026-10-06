<?php
/**
 * Боты: доставка кода подтверждения телефона и уведомления оператору
 * о новых бронях (Telegram + MAX). Все вызовы безопасны: при ошибке сети
 * или отсутствии токенов ничего не падает.
 */
declare(strict_types=1);

function http_post_json(string $url, array $payload, int $timeout = 8): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => 5,
    ]);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    $json = is_string($resp) ? json_decode($resp, true) : null;
    return ['ok' => $code >= 200 && $code < 300, 'status' => $code, 'body' => is_array($json) ? $json : [], 'error' => $err];
}

// ------------------------------------------------------------------ Telegram-бот
function tg_send(string $chatId, string $text): bool {
    $token = (string)cfg('telegram_bot_token', '');
    if (!$token || !$chatId) return false;
    $r = http_post_json("https://api.telegram.org/bot$token/sendMessage", [
        'chat_id' => $chatId, 'text' => $text, 'parse_mode' => 'HTML', 'disable_web_page_preview' => true,
    ]);
    return $r['ok'];
}

// Telegram Gateway — код подтверждения в Telegram по номеру телефона.
function tg_gateway_send_code(string $phoneE164, string $code): bool {
    $token = (string)cfg('telegram_gateway_token', '');
    if (!$token) return false;
    $ch = curl_init('https://gatewayapi.telegram.org/sendVerificationMessage');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode(['phone_number' => ltrim($phoneE164, '+'), 'code' => $code, 'code_length' => 6], JSON_UNESCAPED_UNICODE),
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_CONNECTTIMEOUT => 5,
    ]);
    $resp = curl_exec($ch);
    curl_close($ch);
    $json = is_string($resp) ? json_decode($resp, true) : null;
    return is_array($json) && !empty($json['ok']);
}

// ------------------------------------------------------------------ MAX-бот
function max_send(string $chatId, string $text): bool {
    $token = (string)cfg('max_bot_token', '');
    if (!$token || !$chatId) return false;
    $r = http_post_json("https://botapi.max.ru/messages?access_token=" . urlencode($token), [
        'chat_id' => (int)$chatId, 'text' => $text,
    ]);
    return $r['ok'];
}

// ------------------------------------------------------------------ высокий уровень
/** Доставить код входа выбранным каналом. true — доставлено (код на экране не показываем). */
function deliver_login_code(string $phone, string $code, string $channel): bool {
    // Единственный способ отправить «по номеру телефона» без старта бота — Telegram Gateway.
    if (tg_gateway_send_code($phone, $code)) return true;
    // Здесь можно подключить SMS-провайдера (cfg('sms')). Пока не настроен — не доставлено.
    return false;
}

/** Уведомить операторов (Telegram + MAX) о событии. */
function notify_operators(string $text): void {
    foreach ((array)cfg('telegram_operator_chat_ids', []) as $cid) {
        try { tg_send((string)$cid, $text); } catch (Throwable $e) {}
    }
    foreach ((array)cfg('max_operator_chat_ids', []) as $cid) {
        try { max_send((string)$cid, $text); } catch (Throwable $e) {}
    }
}
