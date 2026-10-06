<?php
require __DIR__ . '/lib/bootstrap.php';

$STATUSES = ['new' => 'Новая', 'confirmed' => 'Подтверждена', 'paid' => 'Оплачена', 'done' => 'Сыграна', 'cancelled' => 'Отменена'];
$msg = null; $err = null;

// Выход
if (($_GET['logout'] ?? '') === '1') { $_SESSION['admin'] = false; redirect('/admin.php'); }

// Вход
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['form'] ?? '') === 'login') {
    $hash = (string)($config['admin']['password_hash'] ?? '');
    if ($hash && password_verify((string)($_POST['password'] ?? ''), $hash)) {
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        redirect('/admin.php');
    } else {
        $err = 'Неверный пароль.';
    }
}

$authed = !empty($_SESSION['admin']);

// Смена статуса
if ($authed && $_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['form'] ?? '') === 'status') {
    if (!csrf_check($_POST['csrf'] ?? null)) {
        $err = 'Сессия устарела, обновите страницу.';
    } else {
        $id = (int)($_POST['id'] ?? 0);
        $new = (string)($_POST['status'] ?? '');
        if ($id && isset($STATUSES[$new])) {
            try {
                db($config)->prepare('UPDATE bookings SET status = ? WHERE id = ?')->execute([$new, $id]);
                $msg = "Заявка №{$id}: статус обновлён.";
            } catch (Throwable $ex) { $err = 'Ошибка обновления.'; error_log('[nery] ' . $ex->getMessage()); }
        }
    }
}

$rows = [];
if ($authed) {
    try {
        $rows = db($config)->query('SELECT * FROM bookings ORDER BY id DESC LIMIT 500')->fetchAll();
    } catch (Throwable $ex) { $err = 'Не удалось прочитать заявки (создана ли таблица?).'; error_log('[nery] ' . $ex->getMessage()); }
}
?>
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Панель оператора — <?= e($content['brand']['name']) ?></title>
<link rel="stylesheet" href="/assets/styles.css?v=1">
</head>
<body class="admin">
<header class="site-header"><div class="wrap header-inner">
  <a class="logo" href="/"><span class="logo-mark">🦇</span> <?= e($content['brand']['name']) ?> · оператор</a>
  <?php if ($authed): ?><a class="btn btn-sm btn-ghost" href="/admin.php?logout=1">Выйти</a><?php endif; ?>
</div></header>

<main class="wrap section">
<?php if ($msg): ?><div class="notice success"><?= e($msg) ?></div><?php endif; ?>
<?php if ($err): ?><div class="notice error"><?= e($err) ?></div><?php endif; ?>

<?php if (!$authed): ?>
  <h1 class="section-title">Вход</h1>
  <form class="booking-form narrow" method="post" action="/admin.php">
    <input type="hidden" name="form" value="login">
    <label>Пароль<input type="password" name="password" autofocus required></label>
    <button class="btn btn-lg" type="submit">Войти</button>
  </form>
<?php else: ?>
  <h1 class="section-title">Заявки</h1>
  <?php if (!$rows): ?>
    <p class="muted">Пока заявок нет.</p>
  <?php else: ?>
  <div class="table-scroll">
  <table class="bk-table">
    <thead><tr>
      <th>№</th><th>Когда</th><th>Клиент</th><th>Игра</th><th>Опции</th><th>≈ Сумма</th><th>Статус</th>
    </tr></thead>
    <tbody>
    <?php foreach ($rows as $r):
      $deco = [];
      if ($r['deco_birthday'])  $deco[] = 'надпись';
      if ($r['deco_tableware']) $deco[] = 'посуда';
      if ($r['deco_balloons'])  $deco[] = 'шары';
      $opts = [];
      if ($r['rest_room']) $opts[] = 'комната ' . (int)$r['rest_hours'] . 'ч';
      if ($deco) $opts[] = 'оформление: ' . implode(', ', $deco);
    ?>
      <tr class="st-<?= e($r['status']) ?>">
        <td><?= (int)$r['id'] ?></td>
        <td class="nowrap"><?= e(date('d.m H:i', strtotime($r['created_at']))) ?><?= $r['notified'] ? '' : ' <span title="уведомление не ушло">⚠️</span>' ?></td>
        <td><?= e($r['name']) ?><br><a href="tel:<?= e($r['phone']) ?>"><?= e($r['phone']) ?></a></td>
        <td class="nowrap">
          <?= e($r['play_date'] ?: '—') ?> <?= e($r['play_time'] ?: '') ?><br>
          <?= (int)$r['players'] ?> чел<?= $r['ages'] ? ' (' . e($r['ages']) . ')' : '' ?><br>
          <span class="muted"><?= e($r['level'] ?: 'уровень на месте') ?></span>
        </td>
        <td><?= $opts ? e(implode('; ', $opts)) : '—' ?><?= $r['comment'] ? '<br><span class="muted">' . e($r['comment']) . '</span>' : '' ?></td>
        <td class="nowrap"><?= rub((int)$r['price_estimate']) ?></td>
        <td>
          <form method="post" action="/admin.php" class="st-form">
            <input type="hidden" name="form" value="status">
            <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
            <input type="hidden" name="id" value="<?= (int)$r['id'] ?>">
            <select name="status" onchange="this.form.submit()">
              <?php foreach ($STATUSES as $k => $label): ?>
                <option value="<?= e($k) ?>" <?= $r['status'] === $k ? 'selected' : '' ?>><?= e($label) ?></option>
              <?php endforeach; ?>
            </select>
          </form>
        </td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
  </div>
  <?php endif; ?>
<?php endif; ?>
</main>
</body>
</html>
