<?php
require __DIR__ . '/lib/bootstrap.php';
$c = $content; $q = $c['quest'];
$s = get_settings($config);
$options = get_active_options($config);
?>
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($q['title']) ?> — <?= e($c['brand']['name']) ?> · квест в Нерюнгри</title>
<meta name="description" content="Хоррор-квест «<?= e($q['title']) ?>» с живым актёром в Нерюнгри. 3 уровня сложности, ~<?= e((string)$s['duration_min']) ?> мин, от 1 до <?= e((string)$s['max_per_game']) ?> игроков. Онлайн-запись.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,600&family=Oswald:wght@400;600&family=PT+Sans:wght@400;700&display=swap&subset=cyrillic" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css?v=2">
</head>
<body>
<header class="site-header"><div class="wrap header-inner">
  <a class="logo" href="/"><span class="logo-mark">🦇</span> <?= e($c['brand']['name']) ?></a>
  <nav class="nav">
    <a href="#quest">Квест</a><a href="#prices">Цены</a><a href="#location">Адрес</a>
    <a class="btn btn-sm" href="/booking.php">Записаться</a>
  </nav>
</div></header>

<section class="hero"><div class="hero-bg" aria-hidden="true"></div>
  <div class="wrap hero-inner">
    <p class="eyebrow"><?= e($q['subtitle']) ?></p>
    <h1 class="hero-title"><?= e($q['title']) ?></h1>
    <p class="hero-lead"><?= e($q['lead']) ?></p>
    <div class="hero-meta">
      <span>⏱ ~<?= e((string)$s['duration_min']) ?> мин</span>
      <span>👥 1–<?= e((string)$s['max_per_game']) ?> чел</span>
      <span>🎭 живой актёр</span><span>🔥 3 уровня</span>
    </div>
    <a class="btn btn-lg" href="/booking.php">Записаться на игру</a>
  </div>
</section>

<main>
  <section id="quest" class="section wrap">
    <h2 class="section-title">О квесте</h2>
    <?php foreach ($q['description'] as $p): ?><p class="lede"><?= e($p) ?></p><?php endforeach; ?>
    <div class="levels">
      <?php foreach ($q['levels'] as $i => $lv): ?>
        <div class="level-card"><div class="level-num"><?= $i + 1 ?></div><h3><?= e($lv['name']) ?></h3><p><?= e($lv['desc']) ?></p></div>
      <?php endforeach; ?>
    </div>
    <p class="muted">Уровень выбираете прямо перед игрой — вместе с оператором.</p>
  </section>

  <section id="prices" class="section wrap">
    <h2 class="section-title">Цены</h2>
    <div class="price-grid">
      <div class="price-card accent">
        <h3><?= e($q['title']) ?></h3>
        <p class="price"><?= rub((int)$s['base_price']) ?></p>
        <p class="muted">за команду до <?= e((string)$s['base_players']) ?> человек</p>
        <ul class="ticks">
          <li>Доп. игрок — <?= rub((int)$s['extra_per_player']) ?> (до <?= e((string)$s['max_per_game']) ?> чел)</li>
          <li>Больше <?= e((string)$s['max_per_game']) ?> — делим на игры по <?= rub((int)$s['base_price']) ?></li>
          <li>Длительность ~<?= e((string)$s['duration_min']) ?> мин</li>
        </ul>
      </div>
      <?php if ($options): ?>
      <div class="price-card">
        <h3>Дополнительно</h3>
        <ul class="ticks">
          <?php foreach ($options as $o): ?><li><?= e($o['label']) ?> — <?= rub((int)$o['price']) ?><?= $o['unit'] === 'hour' ? '/час' : '' ?></li><?php endforeach; ?>
        </ul>
      </div>
      <?php endif; ?>
      <div class="price-card">
        <h3>Предоплата</h3>
        <p class="price"><?= rub((int)$s['prepay_amount']) ?></p>
        <p class="muted">для записи; остальное на месте. Возврат при отмене за <?= e((string)$s['cancel_hours']) ?> ч.</p>
      </div>
    </div>
    <a class="btn btn-lg" href="/booking.php" style="margin-top:24px">Рассчитать и записаться</a>
  </section>

  <section class="section wrap">
    <h2 class="section-title">Как это проходит</h2>
    <ul class="rules"><?php foreach ($c['rules'] as $r): ?><li><?= e($r) ?></li><?php endforeach; ?></ul>
  </section>

  <section id="location" class="section wrap">
    <h2 class="section-title">Как добраться</h2>
    <p class="lede"><strong><?= e($c['brand']['address']) ?></strong></p>
    <p class="muted"><?= e($c['brand']['address_hint']) ?></p>
    <a class="btn btn-ghost" href="<?= e($c['brand']['map_url']) ?>" target="_blank" rel="noopener">Открыть на Яндекс.Картах →</a>
  </section>
</main>

<footer class="site-footer"><div class="wrap">
  <p><strong><?= e($c['brand']['name']) ?></strong> · <?= e($c['brand']['address']) ?></p>
  <p class="muted"><a href="<?= e($c['brand']['map_url']) ?>" target="_blank" rel="noopener">Яндекс.Карты</a> · квесты в реальности</p>
</div></footer>
</body>
</html>
