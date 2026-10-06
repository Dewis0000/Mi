<?php
require __DIR__ . '/lib/bootstrap.php';

$c = $content;
$q = $c['quest'];
$errors = [];

// ---- Обработка заявки (POST) ----
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['form'] ?? '') === 'booking') {
    if (!csrf_check($_POST['csrf'] ?? null)) {
        $errors[] = 'Сессия устарела, обновите страницу и попробуйте снова.';
    }

    $name  = trim((string)($_POST['name'] ?? ''));
    $phone = normalize_phone((string)($_POST['phone'] ?? ''));
    $players = (int)($_POST['players'] ?? 0);
    $ages  = trim((string)($_POST['ages'] ?? ''));
    $level = trim((string)($_POST['level'] ?? ''));
    $date  = trim((string)($_POST['play_date'] ?? ''));
    $time  = trim((string)($_POST['play_time'] ?? ''));
    $restRoom = !empty($_POST['rest_room']);
    $restHours = $restRoom ? max(1, (int)($_POST['rest_hours'] ?? 1)) : 0;
    $comment = trim((string)($_POST['comment'] ?? ''));
    $consent = !empty($_POST['consent']);
    $deco = [
        'birthday'  => !empty($_POST['deco']['birthday']),
        'tableware' => !empty($_POST['deco']['tableware']),
        'balloons'  => !empty($_POST['deco']['balloons']),
    ];

    if (mb_strlen($name) < 2 || mb_strlen($name) > 120) $errors[] = 'Укажите имя.';
    if (!$phone) $errors[] = 'Укажите корректный номер телефона.';
    if ($players < $q['players_min'] || $players > $q['players_max']) {
        $errors[] = 'Количество игроков — от ' . $q['players_min'] . ' до ' . $q['players_max'] . '.';
    }
    if (!$consent) $errors[] = 'Нужно согласие на обработку персональных данных.';
    if (mb_strlen($comment) > 1000) $comment = mb_substr($comment, 0, 1000);
    if ($date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) $date = '';

    // Антиспам по IP
    if (!$errors) {
        try {
            $limit = (int)($config['rate_limit_seconds'] ?? 60);
            $st = db($config)->prepare('SELECT created_at FROM bookings WHERE ip = ? ORDER BY id DESC LIMIT 1');
            $st->execute([client_ip()]);
            $last = $st->fetchColumn();
            if ($last && (time() - strtotime($last)) < $limit) {
                $errors[] = 'Вы только что отправили заявку. Подождите минуту.';
            }
        } catch (Throwable $ex) {
            error_log('[nery] ratelimit ' . $ex->getMessage());
        }
    }

    if (!$errors) {
        $in = ['players' => $players, 'rest_room' => $restRoom, 'rest_hours' => $restHours, 'deco' => $deco];
        $price = estimate_price($c, $in);
        try {
            $st = db($config)->prepare(
                'INSERT INTO bookings
                 (status,name,phone,play_date,play_time,players,ages,level,rest_room,rest_hours,
                  deco_birthday,deco_tableware,deco_balloons,comment,price_estimate,ip,user_agent)
                 VALUES (\'new\',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
            );
            $st->execute([
                $name, $phone, $date ?: null, $time ?: null, $players, $ages ?: null, $level ?: null,
                $restRoom ? 1 : 0, $restHours,
                $deco['birthday'] ? 1 : 0, $deco['tableware'] ? 1 : 0, $deco['balloons'] ? 1 : 0,
                $comment ?: null, $price, client_ip(), substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ]);
            $id = (int)db($config)->lastInsertId();

            // Уведомление оператору
            $decoText = [];
            if ($deco['birthday'])  $decoText[] = 'надпись «С днём рождения»';
            if ($deco['tableware']) $decoText[] = 'посуда';
            if ($deco['balloons'])  $decoText[] = 'шары';
            $lines = [
                "🦇 Новая заявка №{$id} — {$q['title']}",
                "Имя: {$name}",
                "Телефон: {$phone}",
                'Дата/время: ' . (($date ?: '—') . ' ' . ($time ?: '')),
                "Игроков: {$players}" . ($ages ? " (возраст: {$ages})" : ''),
                'Уровень: ' . ($level ?: 'выберут на месте'),
                'Комната отдыха: ' . ($restRoom ? "да, {$restHours} ч" : 'нет'),
                'Оформление: ' . ($decoText ? implode(', ', $decoText) : 'нет'),
            ];
            if ($comment) $lines[] = "Комментарий: {$comment}";
            $lines[] = 'Ориентир. стоимость: ' . rub($price);
            $lines[] = ($config['site_url'] ?? '') . '/admin.php';
            $notified = notify_operators($config, implode("\n", $lines));
            if ($notified) {
                db($config)->prepare('UPDATE bookings SET notified = 1 WHERE id = ?')->execute([$id]);
            }

            $_SESSION['flash_booking'] = [
                'id' => $id, 'name' => $name, 'price' => $price,
                'prepay' => $config['prepay'] ?? [], 'amount' => (int)$c['prepay']['amount'],
            ];
            redirect('/?sent=1#booking');
        } catch (Throwable $ex) {
            error_log('[nery] booking insert ' . $ex->getMessage());
            $errors[] = 'Не удалось сохранить заявку. Попробуйте позже или позвоните нам.';
        }
    }
}

$flash = $_SESSION['flash_booking'] ?? null;
unset($_SESSION['flash_booking']);
$old = $_POST; // для повторного заполнения при ошибке
?>
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($q['title']) ?> — <?= e($c['brand']['name']) ?> · квест в Нерюнгри</title>
<meta name="description" content="Хоррор-квест «<?= e($q['title']) ?>» с живым актёром в Нерюнгри. 3 уровня сложности, ~1 час, от <?= e((string)$q['players_min']) ?> до <?= e((string)$q['players_max']) ?> игроков. Онлайн-запись.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,800;1,600&family=Oswald:wght@400;600&family=PT+Sans:wght@400;700&display=swap&subset=cyrillic,cyrillic-ext" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css?v=1">
</head>
<body>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="logo" href="/"><span class="logo-mark">🦇</span> <?= e($c['brand']['name']) ?></a>
    <nav class="nav">
      <a href="#quest">Квест</a>
      <a href="#prices">Цены</a>
      <a href="#location">Как добраться</a>
      <a class="btn btn-sm" href="#booking">Записаться</a>
    </nav>
  </div>
</header>

<section class="hero">
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="wrap hero-inner">
    <p class="eyebrow"><?= e($q['subtitle']) ?></p>
    <h1 class="hero-title"><?= e($q['title']) ?></h1>
    <p class="hero-lead"><?= e($q['lead']) ?></p>
    <div class="hero-meta">
      <span>⏱ ~<?= e((string)$q['duration_min']) ?> мин</span>
      <span>👥 <?= e((string)$q['players_min']) ?>–<?= e((string)$q['players_max']) ?> чел</span>
      <span>🎭 живой актёр</span>
      <span>🔥 3 уровня</span>
    </div>
    <a class="btn btn-lg" href="#booking">Записаться на игру</a>
  </div>
</section>

<main>
  <section id="quest" class="section wrap">
    <h2 class="section-title">О квесте</h2>
    <?php foreach ($q['description'] as $p): ?><p class="lede"><?= e($p) ?></p><?php endforeach; ?>
    <div class="levels">
      <?php foreach ($q['levels'] as $i => $lv): ?>
        <div class="level-card">
          <div class="level-num"><?= $i + 1 ?></div>
          <h3><?= e($lv['name']) ?></h3>
          <p><?= e($lv['desc']) ?></p>
        </div>
      <?php endforeach; ?>
    </div>
    <p class="muted">Уровень выбираете прямо перед игрой — вместе с оператором.</p>
  </section>

  <section id="prices" class="section wrap">
    <h2 class="section-title">Цены</h2>
    <div class="price-grid">
      <div class="price-card accent">
        <h3><?= e($q['title']) ?></h3>
        <p class="price"><?= rub((int)$q['price_base']) ?></p>
        <p class="muted">за команду до <?= e((string)$q['players_base']) ?> человек</p>
        <ul class="ticks">
          <li>Доп. игрок — <?= rub((int)$q['price_extra']) ?> (до <?= e((string)$q['players_max']) ?> чел)</li>
          <li>Длительность ~<?= e((string)$q['duration_min']) ?> мин</li>
          <li>3 уровня сложности</li>
        </ul>
      </div>
      <?php if (!empty($c['restroom']['enabled'])): ?>
      <div class="price-card">
        <h3><?= e($c['restroom']['title']) ?></h3>
        <p class="price"><?= rub((int)$c['restroom']['price_per_hour']) ?><span>/час</span></p>
        <p class="muted"><?= e($c['restroom']['desc']) ?></p>
      </div>
      <?php endif; ?>
      <div class="price-card">
        <h3>Оформление комнаты</h3>
        <ul class="ticks">
          <?php foreach ($c['decorations'] as $d): ?>
            <li><?= e($d['label']) ?> — <?= rub((int)$d['price']) ?></li>
          <?php endforeach; ?>
        </ul>
      </div>
    </div>
  </section>

  <section class="section wrap">
    <h2 class="section-title">Как это проходит</h2>
    <ul class="rules">
      <?php foreach ($c['rules'] as $r): ?><li><?= e($r) ?></li><?php endforeach; ?>
    </ul>
  </section>

  <section id="location" class="section wrap">
    <h2 class="section-title">Как добраться</h2>
    <p class="lede"><strong><?= e($c['brand']['address']) ?></strong>, <?= e($c['brand']['city']) ?></p>
    <p class="muted"><?= e($c['brand']['address_hint']) ?></p>
    <a class="btn btn-ghost" href="<?= e($c['brand']['map_url']) ?>" target="_blank" rel="noopener">Открыть на Яндекс.Картах →</a>
  </section>

  <section id="booking" class="section wrap">
    <h2 class="section-title">Запись на игру</h2>

    <?php if ($flash): ?>
      <div class="notice success">
        <h3>Заявка №<?= e((string)$flash['id']) ?> принята! 🦇</h3>
        <p><?= e($flash['name']) ?>, спасибо! Мы свяжемся с вами для подтверждения. Ориентировочная стоимость — <strong><?= rub((int)$flash['price']) ?></strong>.</p>
        <div class="prepay">
          <p><strong>Чтобы закрепить время, нужна предоплата <?= rub((int)$flash['amount']) ?></strong> переводом:</p>
          <p class="prepay-req">
            <?= e($flash['prepay']['phone'] ?? '') ?> · <?= e($flash['prepay']['bank'] ?? '') ?> · <?= e($flash['prepay']['name'] ?? '') ?>
          </p>
          <p class="muted">После перевода пришлите чек оператору. Возврат — при отмене минимум за день.</p>
        </div>
      </div>
    <?php endif; ?>

    <?php if ($errors): ?>
      <div class="notice error"><ul><?php foreach ($errors as $er): ?><li><?= e($er) ?></li><?php endforeach; ?></ul></div>
    <?php endif; ?>

    <form class="booking-form" method="post" action="/#booking" novalidate>
      <input type="hidden" name="form" value="booking">
      <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
      <div class="grid2">
        <label>Имя <span class="req">*</span>
          <input type="text" name="name" required maxlength="120" value="<?= e($old['name'] ?? '') ?>">
        </label>
        <label>Телефон <span class="req">*</span>
          <input type="tel" name="phone" required placeholder="+7 ___ ___-__-__" value="<?= e($old['phone'] ?? '') ?>">
        </label>
        <label>Желаемая дата
          <input type="date" name="play_date" value="<?= e($old['play_date'] ?? '') ?>">
        </label>
        <label>Время
          <input type="time" name="play_time" value="<?= e($old['play_time'] ?? '') ?>">
        </label>
        <label>Игроков <span class="req">*</span>
          <input type="number" id="players" name="players" min="<?= e((string)$q['players_min']) ?>" max="<?= e((string)$q['players_max']) ?>" value="<?= e((string)($old['players'] ?? 2)) ?>" required>
        </label>
        <label>Возраст участников
          <input type="text" name="ages" maxlength="120" placeholder="например, 25, 27, 30" value="<?= e($old['ages'] ?? '') ?>">
        </label>
      </div>

      <label>Уровень сложности
        <select name="level">
          <option value="">Выберу перед игрой</option>
          <?php foreach ($q['levels'] as $lv): ?>
            <option value="<?= e($lv['name']) ?>" <?= (($old['level'] ?? '') === $lv['name']) ? 'selected' : '' ?>><?= e($lv['name']) ?></option>
          <?php endforeach; ?>
        </select>
      </label>

      <fieldset class="options">
        <legend>Комната отдыха и оформление</legend>
        <label class="check">
          <input type="checkbox" id="restRoom" name="rest_room" value="1" <?= !empty($old['rest_room']) ? 'checked' : '' ?>>
          Нужна комната отдыха (<?= rub((int)$c['restroom']['price_per_hour']) ?>/час)
        </label>
        <label id="restHoursRow">Часов
          <input type="number" id="restHours" name="rest_hours" min="1" max="12" value="<?= e((string)($old['rest_hours'] ?? 1)) ?>">
        </label>
        <?php foreach ($c['decorations'] as $d): ?>
          <label class="check">
            <input type="checkbox" class="deco" name="deco[<?= e($d['key']) ?>]" value="1" data-price="<?= e((string)$d['price']) ?>" <?= !empty($old['deco'][$d['key']]) ? 'checked' : '' ?>>
            <?= e($d['label']) ?> — <?= rub((int)$d['price']) ?>
          </label>
        <?php endforeach; ?>
      </fieldset>

      <label>Комментарий
        <textarea name="comment" rows="3" maxlength="1000" placeholder="Повод, пожелания, вопросы"><?= e($old['comment'] ?? '') ?></textarea>
      </label>

      <div class="estimate">Ориентировочная стоимость: <strong id="estVal"><?= rub((int)$q['price_base']) ?></strong></div>

      <label class="check">
        <input type="checkbox" name="consent" value="1" required <?= !empty($old['consent']) ? 'checked' : '' ?>>
        Согласен(на) на обработку персональных данных <span class="req">*</span>
      </label>

      <button class="btn btn-lg" type="submit">Отправить заявку</button>
      <p class="muted small">После заявки мы свяжемся с вами и пришлём реквизиты для предоплаты <?= rub((int)$c['prepay']['amount']) ?>.</p>
    </form>
  </section>
</main>

<footer class="site-footer">
  <div class="wrap">
    <p><strong><?= e($c['brand']['name']) ?></strong> · <?= e($c['brand']['address']) ?>, <?= e($c['brand']['city']) ?></p>
    <p class="muted"><a href="<?= e($c['brand']['map_url']) ?>" target="_blank" rel="noopener">Яндекс.Карты</a> · квесты в реальности</p>
  </div>
</footer>

<script>
(function () {
  var PRICE_BASE = <?= (int)$q['price_base'] ?>, BASE_PLAYERS = <?= (int)$q['players_base'] ?>,
      EXTRA = <?= (int)$q['price_extra'] ?>, REST = <?= (int)$c['restroom']['price_per_hour'] ?>,
      MINP = <?= (int)$q['players_min'] ?>, MAXP = <?= (int)$q['players_max'] ?>;
  function num(el, d){ var v = parseInt(el && el.value, 10); return isNaN(v) ? d : v; }
  function fmt(n){ return n.toLocaleString('ru-RU') + ' ₽'; }
  var players = document.getElementById('players'), restRoom = document.getElementById('restRoom'),
      restHours = document.getElementById('restHours'), restRow = document.getElementById('restHoursRow'),
      estVal = document.getElementById('estVal');
  function calc(){
    var p = Math.max(MINP, Math.min(MAXP, num(players, MINP)));
    var total = PRICE_BASE + Math.max(0, p - BASE_PLAYERS) * EXTRA;
    if (restRoom && restRoom.checked) total += Math.max(1, num(restHours, 1)) * REST;
    document.querySelectorAll('.deco').forEach(function(d){ if (d.checked) total += parseInt(d.dataset.price, 10) || 0; });
    if (restRow) restRow.style.display = (restRoom && restRoom.checked) ? '' : 'none';
    if (estVal) estVal.textContent = fmt(total);
  }
  ['change','input'].forEach(function(ev){ document.querySelector('.booking-form').addEventListener(ev, calc); });
  calc();
})();
</script>
</body>
</html>
