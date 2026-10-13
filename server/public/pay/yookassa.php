<?php
// Уведомления ЮKassa о платежах (настраивается в личном кабинете: Интеграция → HTTP-уведомления).
// Тело уведомления не доверяем: берём из него только ID платежа и сами запрашиваем статус у ЮKassa.
require __DIR__ . '/../_app.php';
$in = json_decode((string)file_get_contents('php://input'), true);
$ykId = is_array($in) ? (string)($in['object']['id'] ?? '') : '';
if ($ykId === '') { http_response_code(400); exit; }
$p = db_one('SELECT * FROM payments WHERE yk_id = ?', [$ykId]);
if ($p) yk_settle($p);
http_response_code(200);
echo 'ok';
