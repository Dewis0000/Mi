<?php
require __DIR__ . '/lib/bootstrap.php';

$c = $content;
$q = $c['quest'];
$settings = get_settings($config);
$options  = get_active_options($config);
$vmode = verify_mode($config);
$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['form'] ?? '') === 'booking') {
    if (!csrf_check($_POST['csrf'] ?? null)) $errors[] = 'Сессия устарела, обновите страницу.';

    $name  = trim((string)($_POST['name'] ?? ''));
    $phone = normalize_phone((string)($_POST['phone'] ?? ''));
    $players = (int)($_POST['players'] ?? 0);
    $level = trim((string)($_POST['level'] ?? ''));
    $date  = trim((string)($_POST['play_date'] ?? ''));
    $time  = trim((string)($_POST['play_time'] ?? ''));
    $comment = trim((string)($_POST['comment'] ?? ''));
    $consent = !empty($_POST['consent']);

    if (mb_strlen($name) < 2 || mb_strlen($name) > 120) $errors[] = 'Укажите имя.';
    if (!$phone) $errors[] = 'Укажите корректный номер телефона.';
    if ($players < 1 || $players > 50) $errors[] = 'Укажите количество игроков (1–50).';
    if (!$consent) $errors[] = 'Нужно согласие на обработку персональных данных.';
    if (mb_strlen($comment) > 1000) $comment = mb_substr($comment, 0, 1000);
    if ($date !== '') {
        $d = DateTime::createFromFormat('!Y-m-d', $date);
        if (!$d || $d->format('Y-m-d') !== $date) $date = '';
    }
    if ($phone && $vmode !== 'off' && !phone_is_verified($config, $phone))
        $errors[] = 'Подтвердите номер телефона кодом.';

    // Выбранные опции
    $sel = [];
    foreach ($options as $o) {
        $id = (int)$o['id'];
        if (empty($_POST['opt'][$id])) continue;
        $sel[$id] = ($o['unit'] === 'hour') ? max(1, min(12, (int)($_POST['opthours'][$id] ?? 1))) : 1;
    }

    // Антиспам по IP
    if (!$errors) {
        try {
            $limit = (int)($config['rate_limit_seconds'] ?? 60);
            $st = db($config)->prepare('SELECT created_at FROM bookings WHERE ip = ? ORDER BY id DESC LIMIT 1');
            $st->execute([client_ip()]);
            $last = $st->fetchColumn();
            if ($last && (strtotime(db_now(db($config))) - strtotime($last)) < $limit)
                $errors[] = 'Вы только что отправили заявку. Подождите минуту.';
        } catch (Throwable $ex) { error_log('[nery] ratelimit ' . $ex->getMessage()); }
    }

    if (!$errors) {
        $r = compute_booking($settings, $options, $players, $sel);
        $verified = ($vmode !== 'off') && phone_is_verified($config, $phone);
        try {
            $st = db($config)->prepare(
                'INSERT INTO bookings (status,name,phone,phone_verified,play_date,play_time,players,games,level,
                 options_json,games_total,options_total,total,prepay,comment,ip)
                 VALUES (\'new\',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
            );
            $st->execute([
                $name, $phone, $verified ? 1 : 0, $date ?: null, $time ?: null, $r['players'], $r['games'], $level ?: null,
                json_encode($r['lines'], JSON_UNESCAPED_UNICODE), $r['gamesTotal'], $r['optionsTotal'], $r['total'], $r['prepay'],
                $comment ?: null, client_ip(),
            ]);
            $id = (int)db($config)->lastInsertId();

            // Уведомление оператору
            $lines = [
                "🦇 Заявка №{$id} — {$q['title']}",
                "Имя: {$name}",
                'Телефон: ' . $phone . ($verified ? ' ✓' : ''),
                'Дата/время: ' . (($date ?: '—') . ' ' . ($time ?: '')),
                "Игроков: {$r['players']}" . ($r['split'] ? " (делим на {$r['games']} игры)" : ''),
                'Уровень: ' . ($level ?: 'выберут на месте'),
            ];
            foreach ($r['lines'] as $ln)
                $lines[] = '• ' . $ln['label'] . ($ln['unit'] === 'hour' ? " ×{$ln['qty']} ч" : '') . ' — ' . rub($ln['line']);
            if ($comment) $lines[] = "Комментарий: {$comment}";
            $lines[] = 'Итого: ' . rub($r['total']) . ' · предоплата ' . rub($r['prepay']);
            $lines[] = ($config['site_url'] ?? '') . '/admin.php';
            $notified = notify_operators($config, implode("\n", $lines));
            if ($notified) db($config)->prepare('UPDATE bookings SET notified = 1 WHERE id = ?')->execute([$id]);

            unset($_SESSION['verified_phone']);
            $_SESSION['flash_booking'] = ['id' => $id, 'name' => $name, 'r' => $r, 'prepay_req' => $config['prepay'] ?? []];
            redirect('/booking.php?sent=1');
        } catch (Throwable $ex) {
            error_log('[nery] booking insert ' . $ex->getMessage());
            $errors[] = 'Не удалось сохранить заявку. Попробуйте позже.';
        }
    }
}

$flash = $_SESSION['flash_booking'] ?? null;
unset($_SESSION['flash_booking']);
$old = $_POST;

// данные для живого расчёта в JS
$jsData = [
    'settings' => [
        'base_price' => $settings['base_price'], 'base_players' => $settings['base_players'],
        'extra_per_player' => $settings['extra_per_player'], 'max_per_game' => $settings['max_per_game'],
        'prepay_amount' => $settings['prepay_amount'],
    ],
    'options' => array_map(fn($o) => ['id' => (int)$o['id'], 'label' => $o['label'], 'price' => (int)$o['price'], 'unit' => $o['unit']], $options),
    'verify' => $vmode,
];
?>
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Запись на «<?= e($q['title']) ?>» — <?= e($c['brand']['name']) ?></title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Oswald:wght@400;600&family=PT+Sans:wght@400;700&display=swap&subset=cyrillic" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css?v=2">
</head>
<body>
<header class="site-header"><div class="wrap header-inner">
  <a class="logo" href="/"><span class="logo-mark">🦇</span> <?= e($c['brand']['name']) ?></a>
  <a class="btn btn-sm btn-ghost" href="/">На главную</a>
</div></header>

<main class="wrap section">
  <h1 class="section-title">Запись на игру</h1>

  <?php if ($flash): $r = $flash['r']; $pr = $flash['prepay_req']; ?>
    <div class="notice success">
      <h3>Заявка №<?= e((string)$flash['id']) ?> принята! 🦇</h3>
      <p><?= e($flash['name']) ?>, спасибо! Мы свяжемся с вами для подтверждения.</p>
      <p>Итого ориентировочно: <strong><?= rub((int)$r['total']) ?></strong><?= $r['split'] ? ' (' . e((string)$r['games']) . ' игры)' : '' ?>.</p>
      <div class="prepay">
        <p><strong>Для записи — предоплата <?= rub((int)$r['prepay']) ?></strong> переводом:</p>
        <p class="prepay-req"><?= e($pr['phone'] ?? '') ?> · <?= e($pr['bank'] ?? '') ?> · <?= e($pr['name'] ?? '') ?></p>
        <p class="muted">После перевода пришлите чек оператору. Возврат — при отмене минимум за сутки.</p>
      </div>
      <a class="btn" href="/">На главную</a>
    </div>
  <?php else: ?>

    <?php if ($errors): ?><div class="notice error"><ul><?php foreach ($errors as $er): ?><li><?= e($er) ?></li><?php endforeach; ?></ul></div><?php endif; ?>

    <form class="booking-form" method="post" action="/booking.php" id="bk">
      <input type="hidden" name="form" value="booking">
      <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
      <div class="grid2">
        <label>Имя <span class="req">*</span><input type="text" name="name" required maxlength="120" value="<?= e($old['name'] ?? '') ?>"></label>
        <label>Телефон <span class="req">*</span><input type="tel" id="phone" name="phone" required placeholder="+7 ___ ___-__-__" value="<?= e($old['phone'] ?? '') ?>"></label>
        <label>Желаемая дата<input type="date" name="play_date" value="<?= e($old['play_date'] ?? '') ?>"></label>
        <label>Время<input type="time" name="play_time" value="<?= e($old['play_time'] ?? '') ?>"></label>
      </div>

      <?php if ($vmode !== 'off'): ?>
      <div class="verify" id="verify">
        <button type="button" class="btn btn-sm btn-ghost" id="sendCode">Получить код в Telegram</button>
        <span class="verify-row" id="codeRow" hidden>
          <input type="text" id="code" inputmode="numeric" maxlength="6" placeholder="Код из Telegram">
          <button type="button" class="btn btn-sm" id="checkCode">Подтвердить</button>
        </span>
        <span id="verifyMsg" class="muted"></span>
      </div>
      <?php endif; ?>

      <label>Игроков <span class="req">*</span>
        <input type="number" id="players" name="players" min="1" max="50" value="<?= e((string)($old['players'] ?? 2)) ?>" required>
      </label>
      <label>Уровень сложности
        <select name="level">
          <option value="">Выберу перед игрой</option>
          <?php foreach ($q['levels'] as $lv): ?><option value="<?= e($lv['name']) ?>" <?= (($old['level'] ?? '') === $lv['name']) ? 'selected' : '' ?>><?= e($lv['name']) ?></option><?php endforeach; ?>
        </select>
      </label>

      <?php if ($options): ?>
      <fieldset class="options"><legend>Дополнительно</legend>
        <?php foreach ($options as $o): $id = (int)$o['id']; $isHour = $o['unit'] === 'hour'; $wasOn = !empty($old['opt'][$id]); ?>
          <div class="opt-row">
            <label class="check">
              <input type="checkbox" class="opt" data-id="<?= $id ?>" name="opt[<?= $id ?>]" value="1" <?= $wasOn ? 'checked' : '' ?>>
              <?= e($o['label']) ?> — <?= rub((int)$o['price']) ?><?= $isHour ? '/час' : '' ?>
            </label>
            <?php if ($isHour): ?>
              <span class="hours" data-for="<?= $id ?>"<?= $wasOn ? '' : ' hidden' ?>>часов
                <input type="number" class="opthours" name="opthours[<?= $id ?>]" min="1" max="12" value="<?= e((string)($old['opthours'][$id] ?? 1)) ?>">
              </span>
            <?php endif; ?>
          </div>
        <?php endforeach; ?>
      </fieldset>
      <?php endif; ?>

      <label>Комментарий<textarea name="comment" rows="3" maxlength="1000" placeholder="Повод, пожелания, вопросы"><?= e($old['comment'] ?? '') ?></textarea></label>

      <div class="estimate" id="estimate"></div>

      <label class="check"><input type="checkbox" name="consent" value="1" required <?= !empty($old['consent']) ? 'checked' : '' ?>> Согласен(на) на обработку персональных данных <span class="req">*</span></label>
      <button class="btn btn-lg" type="submit" id="submitBtn">Отправить заявку</button>
    </form>
  <?php endif; ?>
</main>

<script>window.NERU = <?= json_encode($jsData, JSON_UNESCAPED_UNICODE) ?>;</script>
<script src="/assets/app.js?v=2"></script>
</body>
</html>
