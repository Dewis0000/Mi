<?php
require __DIR__ . '/lib/bootstrap.php';
header('Cache-Control: no-store');

$action = (string)($_POST['action'] ?? '');
if (!csrf_check($_POST['csrf'] ?? null)) json_out(['ok' => false, 'error' => 'Обновите страницу'], 400);

if ($action === 'send_code') {
    $phone = normalize_phone((string)($_POST['phone'] ?? ''));
    if (!$phone) json_out(['ok' => false, 'error' => 'Укажите корректный номер телефона']);
    // лёгкий антиспам: не чаще раза в 30 сек на телефон
    try {
        $st = db($config)->prepare('SELECT created_at FROM verify_codes WHERE phone = ?');
        $st->execute([$phone]);
        $c = $st->fetchColumn();
        if ($c && (strtotime(db_now(db($config))) - strtotime($c)) < 30)
            json_out(['ok' => false, 'error' => 'Код уже отправлен. Подождите немного.']);
    } catch (Throwable $ex) { /* ignore */ }
    $r = verify_send($config, $phone);
    json_out(['ok' => $r['ok'], 'error' => $r['error'], 'debug' => $r['debug'], 'mode' => verify_mode($config)]);
}

if ($action === 'verify_code') {
    $phone = normalize_phone((string)($_POST['phone'] ?? ''));
    if (!$phone) json_out(['ok' => false, 'error' => 'Неверный номер']);
    $ok = verify_check($config, $phone, (string)($_POST['code'] ?? ''));
    json_out(['ok' => $ok, 'error' => $ok ? null : 'Неверный или просроченный код']);
}

json_out(['ok' => false, 'error' => 'Неизвестное действие'], 400);
