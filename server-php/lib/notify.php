<?php
/**
 * Боты: привязка номера телефона к чату (пользователь делится номером в боте),
 * доставка кода подтверждения и уведомления оператору (Telegram + MAX).
 * Все вызовы безопасны: при ошибке сети или отсутствии токенов ничего не падает.
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

// ------------------------------------------------------------------ Telegram
function tg_api(string $method, array $payload): array {
    $token = (string)cfg('telegram_bot_token', '');
    if (!$token) return ['ok' => false, 'body' => []];
    return http_post_json("https://api.telegram.org/bot$token/$method", $payload);
}
/** Отправить сообщение в чат. $extra — напр. ['reply_markup' => [...]] (массив, не строка). */
function tg_send(string $chatId, string $text, array $extra = []): bool {
    if ($chatId === '') return false;
    $r = tg_api('sendMessage', array_merge(['chat_id' => $chatId, 'text' => $text, 'parse_mode' => 'HTML', 'disable_web_page_preview' => true], $extra));
    return !empty($r['body']['ok']);
}

// Telegram Gateway — код подтверждения в Telegram по номеру телефона (без привязки, платно).
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

// ------------------------------------------------------------------ MAX
function max_send(string $chatId, string $text): bool {
    $token = (string)cfg('max_bot_token', '');
    if (!$token || $chatId === '') return false;
    $r = http_post_json('https://botapi.max.ru/messages?access_token=' . urlencode($token), ['chat_id' => (int)$chatId, 'text' => $text]);
    return $r['ok'] && empty($r['body']['code']);
}

// ------------------------------------------------------------------ привязки «номер ↔ чат»
function link_messenger(string $platform, string $phone, string $chatId, ?string $username): void {
    $pdo = db();
    $pdo->prepare('DELETE FROM messenger_links WHERE platform = ? AND phone = ?')->execute([$platform, $phone]);
    $pdo->prepare('INSERT INTO messenger_links (id, platform, phone, chat_id, username, created_at) VALUES (?,?,?,?,?,?)')
        ->execute([uid(), $platform, $phone, $chatId, $username, now_iso()]);
    $col = $platform === 'TELEGRAM' ? 'telegram_chat_id' : ($platform === 'MAX' ? 'max_user_id' : null);
    if ($col) $pdo->prepare("UPDATE users SET $col = ? WHERE phone = ?")->execute([$chatId, $phone]);
}
function link_chat_for_phone(string $platform, string $phone): ?string {
    $st = db()->prepare('SELECT chat_id FROM messenger_links WHERE platform = ? AND phone = ? ORDER BY created_at DESC LIMIT 1');
    $st->execute([$platform, $phone]);
    $v = $st->fetchColumn();
    return $v === false ? null : (string)$v;
}

// ------------------------------------------------------------------ доставка кода входа
/** true — код доставлен (на экране показывать не нужно). */
function deliver_login_code(string $phone, string $code, string $channel): bool {
    $text = "Ваш код для входа на Neru-Квест: <b>$code</b>\n\nЕсли вы не запрашивали код — просто не вводите его.";
    if ($channel === 'MAX') {
        $cid = link_chat_for_phone('MAX', $phone);
        if ($cid && max_send($cid, "Ваш код для входа на Neru-Квест: $code")) return true;
    }
    // Telegram — основной канал: если человек привязал бота (поделился номером)
    $cid = link_chat_for_phone('TELEGRAM', $phone);
    if ($cid && tg_send($cid, $text)) return true;
    // Telegram Gateway (если настроен) — код по номеру без привязки
    if (tg_gateway_send_code($phone, $code)) return true;
    return false;
}

// ------------------------------------------------------------------ уведомления оператору
/** Чаты для уведомлений: из конфига + привязанные Telegram-чаты сотрудников и владельцев. */
function operator_telegram_chats(): array {
    $chats = array_map('strval', (array)cfg('telegram_operator_chat_ids', []));
    $phones = [];
    foreach (db()->query("SELECT phone FROM users WHERE role_key IS NOT NULL AND role_key <> ''")->fetchAll() as $r) {
        $phones[] = $r['phone'];
    }
    foreach ((array)cfg('owner_phones', []) as $op) $phones[] = $op;
    foreach (array_unique($phones) as $ph) {
        $cid = link_chat_for_phone('TELEGRAM', $ph);
        if ($cid) $chats[] = $cid;
    }
    return array_values(array_unique(array_filter($chats)));
}
function notify_operators(string $text): void {
    foreach (operator_telegram_chats() as $cid) {
        try { tg_send((string)$cid, $text); } catch (Throwable $e) {}
    }
    foreach ((array)cfg('max_operator_chat_ids', []) as $cid) {
        try { max_send((string)$cid, $text); } catch (Throwable $e) {}
    }
}
