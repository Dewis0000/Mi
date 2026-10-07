<?php
/**
 * Логика ботов (Telegram + MAX), общая для webhook и для опроса по cron.
 * Приём сообщений («поделиться номером») — через getUpdates по расписанию,
 * т.к. хостинг reg.ru режет входящие webhook-запросы. Отправка кодов —
 * исходящая, работает сразу.
 */
declare(strict_types=1);

// ------------------------------------------------------------------ хранилище ключ-значение (offset/marker/лок)
function kv_get(string $k, string $default = ''): string {
    $st = db()->prepare('SELECT v FROM kv_store WHERE k = ?');
    $st->execute([$k]);
    $v = $st->fetchColumn();
    return $v === false ? $default : (string)$v;
}
function kv_set(string $k, string $v): void {
    db()->prepare('REPLACE INTO kv_store (k, v) VALUES (?, ?)')->execute([$k, $v]);
}

function bot_is_staff(string $phone): bool {
    if (in_array($phone, (array)cfg('owner_phones', []), true)) return true;
    $u = find_user_by_phone($phone);
    return $u && !empty(user_perms($u));
}

// ------------------------------------------------------------------ Telegram: обработка одного сообщения
function bot_tg_handle(array $msg): void {
    $chatId = (string)($msg['chat']['id'] ?? '');
    if ($chatId === '') return;

    if (isset($msg['contact'])) {
        $c = $msg['contact'];
        $own = isset($c['user_id'], $msg['from']['id']) && (string)$c['user_id'] === (string)$msg['from']['id'];
        $phone = $own ? normalize_phone($c['phone_number'] ?? null) : null;
        if ($phone) {
            link_messenger('TELEGRAM', $phone, $chatId, $msg['from']['username'] ?? null);
            $tail = bot_is_staff($phone) ? "\n\nСюда также будут приходить уведомления о новых записях." : '';
            $code = mint_code($phone, 'auth');
            tg_send($chatId, "✅ Готово! Номер <b>$phone</b> привязан.\n\nВаш код для входа на сайт: <b>$code</b>\nВведите его на странице входа (действует 5 минут).$tail", ['reply_markup' => ['remove_keyboard' => true]]);
        } else {
            tg_send($chatId, 'Пожалуйста, поделитесь своим собственным номером — кнопкой ниже.');
        }
        return;
    }

    tg_send(
        $chatId,
        'Здравствуйте! Это бот <b>Neru-Квест</b> 🧛\n\nНажмите кнопку ниже и поделитесь номером телефона — на него приходят коды для входа на сайт и напоминания о бронях.',
        ['reply_markup' => ['keyboard' => [[['text' => '📱 Поделиться номером', 'request_contact' => true]]], 'resize_keyboard' => true, 'one_time_keyboard' => true]],
    );
}

// ------------------------------------------------------------------ MAX: обработка одного обновления
function bot_max_handle(array $upd): void {
    $type = $upd['update_type'] ?? '';
    $msg = $upd['message'] ?? [];
    $chatId = (string)($msg['recipient']['chat_id'] ?? ($upd['chat_id'] ?? ''));
    $welcome = 'Здравствуйте! Это бот <b>Neru-Квест</b>. Нажмите «Поделиться номером» или просто отправьте свой номер телефона сообщением — на него будут приходить коды для входа и напоминания о бронях.';

    if ($type === 'bot_started') {
        if ($chatId) max_api_send($chatId, $welcome, max_contact_keyboard());
        return;
    }
    if ($type !== 'message_created') return;

    $phone = null;
    foreach (($msg['body']['attachments'] ?? []) as $att) {
        if (($att['type'] ?? '') === 'contact') {
            $pl = $att['payload'] ?? [];
            $phone = normalize_phone(extract_phone($pl['phone'] ?? ($pl['vcfInfo'] ?? ($pl['vcfPhone'] ?? ''))));
        }
    }
    if (!$phone) $phone = normalize_phone(extract_phone($msg['body']['text'] ?? ''));

    if ($phone && $chatId) {
        link_messenger('MAX', $phone, $chatId, $msg['sender']['username'] ?? null);
        $tail = bot_is_staff($phone) ? "\n\nСюда также будут приходить уведомления о новых записях." : '';
        $code = mint_code($phone, 'auth');
        max_api_send($chatId, "✅ Готово! Номер $phone привязан.\n\nВаш код для входа на сайт: $code\nВведите его на странице входа (действует 5 минут).$tail");
    } elseif ($chatId) {
        max_api_send($chatId, $welcome, max_contact_keyboard());
    }
}

// ------------------------------------------------------------------ опрос (cron)
function http_get_auth(string $url, string $token, int $timeout): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Authorization: ' . $token],
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => 5,
    ]);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $json = is_string($resp) ? json_decode($resp, true) : null;
    return ['ok' => $code >= 200 && $code < 300, 'status' => $code, 'body' => is_array($json) ? $json : []];
}

function poll_telegram(): void {
    $token = (string)cfg('telegram_bot_token', '');
    if (!$token) return;
    // getUpdates не работает, пока стоит webhook — снимаем его (идемпотентно).
    http_post_json("https://api.telegram.org/bot$token/deleteWebhook", [], 8);
    $offset = (int)kv_get('tg_offset', '0');
    $r = http_post_json("https://api.telegram.org/bot$token/getUpdates", ['offset' => $offset, 'timeout' => 20, 'allowed_updates' => ['message']], 30);
    foreach (($r['body']['result'] ?? []) as $u) {
        $offset = max($offset, (int)($u['update_id'] ?? 0) + 1);
        $m = $u['message'] ?? ($u['edited_message'] ?? null);
        if (is_array($m)) { try { bot_tg_handle($m); } catch (Throwable $e) {} }
    }
    kv_set('tg_offset', (string)$offset);
}

function poll_max(): void {
    $token = (string)cfg('max_bot_token', '');
    if (!$token) return;
    $marker = kv_get('max_marker', '');
    $url = 'https://botapi.max.ru/updates?timeout=20&limit=100' . ($marker !== '' ? '&marker=' . urlencode($marker) : '');
    $r = http_get_auth($url, $token, 30);
    foreach (($r['body']['updates'] ?? []) as $u) {
        if (is_array($u)) { try { bot_max_handle($u); } catch (Throwable $e) {} }
    }
    if (isset($r['body']['marker'])) kv_set('max_marker', (string)$r['body']['marker']);
}

/** Один проход опроса обоих мессенджеров (с простой защитой от наложения). */
function run_poll(): void {
    if (bs_enabled()) return; // боты вынесены на внешний сервис — локальный опрос не нужен
    $last = (int)kv_get('poll_lock', '0');
    if (time() - $last < 50) return; // предыдущий запуск ещё идёт/только что был
    kv_set('poll_lock', (string)time());
    try { poll_telegram(); } catch (Throwable $e) {}
    try { poll_max(); } catch (Throwable $e) {}
}
