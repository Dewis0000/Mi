<?php
require __DIR__ . '/lib/bootstrap.php';

$STATUSES = ['new' => 'Новая', 'confirmed' => 'Подтверждена', 'paid' => 'Оплачена', 'done' => 'Сыграна', 'cancelled' => 'Отменена'];
$SETTING_LABELS = [
    'base_price' => 'Базовая цена игры, ₽', 'base_players' => 'Входит человек в базовую цену',
    'extra_per_player' => 'Доплата за игрока сверх, ₽', 'max_per_game' => 'Максимум игроков в одной игре',
    'prepay_amount' => 'Предоплата, ₽', 'cancel_hours' => 'Возврат при отмене за, ч', 'duration_min' => 'Длительность, мин',
];
$msg = null; $err = null;

if (($_GET['logout'] ?? '') === '1') { $_SESSION['admin'] = false; redirect('/admin.php'); }

// Вход с защитой от перебора
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['form'] ?? '') === 'login') {
    $ip = client_ip();
    $locked = false;
    try {
        $pdo = db($config);
        $st = $pdo->prepare('SELECT attempts, last_at FROM login_attempts WHERE ip = ?');
        $st->execute([$ip]);
        if ($row = $st->fetch()) {
            $fresh = (strtotime(db_now($pdo)) - strtotime($row['last_at'])) < 900; // 15 мин
            if ($fresh && $row['attempts'] >= 7) $locked = true;
            if (!$fresh) $pdo->prepare('DELETE FROM login_attempts WHERE ip = ?')->execute([$ip]);
        }
    } catch (Throwable $ex) { error_log('[nery] ' . $ex->getMessage()); }

    if ($locked) {
        $err = 'Слишком много попыток. Попробуйте через 15 минут.';
    } else {
        $hash = (string)($config['admin']['password_hash'] ?? '');
        if ($hash && password_verify((string)($_POST['password'] ?? ''), $hash)) {
            try { db($config)->prepare('DELETE FROM login_attempts WHERE ip = ?')->execute([$ip]); } catch (Throwable $ex) {}
            session_regenerate_id(true);
            $_SESSION['admin'] = true;
            redirect('/admin.php');
        } else {
            usleep(300000);
            try { upsert_increment(db($config), 'login_attempts', 'ip', $ip, 'attempts', 'last_at'); } catch (Throwable $ex) {}
            $err = 'Неверный пароль.';
        }
    }
}

$authed = !empty($_SESSION['admin']);

// Действия в админке
if ($authed && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $f = $_POST['form'] ?? '';
    if (!csrf_check($_POST['csrf'] ?? null)) {
        $err = 'Сессия устарела, обновите страницу.';
    } elseif ($f === 'settings') {
        $vals = [];
        foreach (array_keys($SETTING_LABELS) as $k) if (isset($_POST[$k])) $vals[$k] = (int)$_POST[$k];
        try { save_settings($config, $vals); $msg = 'Настройки сохранены.'; } catch (Throwable $ex) { $err = 'Ошибка сохранения.'; }
    } elseif ($f === 'option_save') {
        $id = (int)($_POST['id'] ?? 0);
        $label = trim((string)($_POST['label'] ?? ''));
        $price = max(0, (int)($_POST['price'] ?? 0));
        $unit = ($_POST['unit'] ?? 'toggle') === 'hour' ? 'hour' : 'toggle';
        $sort = (int)($_POST['sort'] ?? 0);
        $active = !empty($_POST['active']) ? 1 : 0;
        if ($label === '') { $err = 'Укажите название опции.'; }
        else try {
            if ($id > 0) db($config)->prepare('UPDATE options SET label=?,price=?,unit=?,sort=?,active=? WHERE id=?')->execute([$label, $price, $unit, $sort, $active, $id]);
            else db($config)->prepare('INSERT INTO options (label,price,unit,sort,active) VALUES (?,?,?,?,?)')->execute([$label, $price, $unit, $sort, $active]);
            $msg = 'Опция сохранена.';
        } catch (Throwable $ex) { $err = 'Ошибка сохранения опции.'; error_log('[nery] ' . $ex->getMessage()); }
    } elseif ($f === 'option_delete') {
        try { db($config)->prepare('DELETE FROM options WHERE id = ?')->execute([(int)($_POST['id'] ?? 0)]); $msg = 'Опция удалена.'; } catch (Throwable $ex) { $err = 'Ошибка удаления.'; }
    } elseif ($f === 'status') {
        $id = (int)($_POST['id'] ?? 0); $new = (string)($_POST['status'] ?? '');
        if ($id && isset($STATUSES[$new])) try { db($config)->prepare('UPDATE bookings SET status=? WHERE id=?')->execute([$new, $id]); $msg = "Заявка №{$id}: статус обновлён."; } catch (Throwable $ex) { $err = 'Ошибка.'; }
    }
}

$rows = $settings = $options = [];
if ($authed) {
    $settings = get_settings($config);
    $options = get_all_options($config);
    try { $rows = db($config)->query('SELECT * FROM bookings ORDER BY id DESC LIMIT 500')->fetchAll(); }
    catch (Throwable $ex) { $err = 'Не удалось прочитать заявки (создана ли таблица?).'; error_log('[nery] ' . $ex->getMessage()); }
}
?>
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Панель оператора — <?= e($content['brand']['name']) ?></title>
<link rel="stylesheet" href="/assets/styles.css?v=2">
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

  <h1 class="section-title">Настройки цен</h1>
  <form class="booking-form" method="post" action="/admin.php">
    <input type="hidden" name="form" value="settings"><input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
    <div class="grid2">
      <?php foreach ($SETTING_LABELS as $k => $label): ?>
        <label><?= e($label) ?><input type="number" name="<?= e($k) ?>" min="0" value="<?= e((string)$settings[$k]) ?>"></label>
      <?php endforeach; ?>
    </div>
    <button class="btn" type="submit">Сохранить настройки</button>
  </form>

  <h1 class="section-title" style="margin-top:48px">Опции (добавлять/убирать)</h1>
  <div class="opt-admin">
    <?php foreach ($options as $o): ?>
      <form class="opt-admin-row" method="post" action="/admin.php">
        <input type="hidden" name="form" value="option_save"><input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>"><input type="hidden" name="id" value="<?= (int)$o['id'] ?>">
        <input type="text" name="label" value="<?= e($o['label']) ?>" placeholder="Название">
        <input type="number" name="price" value="<?= e((string)$o['price']) ?>" min="0" title="Цена, ₽">
        <select name="unit"><option value="toggle" <?= $o['unit'] === 'toggle' ? 'selected' : '' ?>>фикс.</option><option value="hour" <?= $o['unit'] === 'hour' ? 'selected' : '' ?>>за час</option></select>
        <input type="number" name="sort" value="<?= e((string)$o['sort']) ?>" title="Порядок" style="width:4rem">
        <label class="check"><input type="checkbox" name="active" value="1" <?= $o['active'] ? 'checked' : '' ?>> вкл</label>
        <button class="btn btn-sm" type="submit">Сохранить</button>
        <button class="btn btn-sm btn-ghost" type="submit" onclick="this.form.querySelector('[name=form]').value='option_delete';return confirm('Удалить опцию?')">Удалить</button>
      </form>
    <?php endforeach; ?>
    <form class="opt-admin-row new" method="post" action="/admin.php">
      <input type="hidden" name="form" value="option_save"><input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>"><input type="hidden" name="id" value="0">
      <input type="text" name="label" placeholder="Новая опция">
      <input type="number" name="price" value="200" min="0">
      <select name="unit"><option value="toggle">фикс.</option><option value="hour">за час</option></select>
      <input type="number" name="sort" value="10" style="width:4rem">
      <label class="check"><input type="checkbox" name="active" value="1" checked> вкл</label>
      <button class="btn btn-sm" type="submit">Добавить</button>
    </form>
  </div>

  <h1 class="section-title" style="margin-top:48px">Заявки</h1>
  <?php if (!$rows): ?><p class="muted">Пока заявок нет.</p><?php else: ?>
  <div class="table-scroll"><table class="bk-table">
    <thead><tr><th>№</th><th>Когда</th><th>Клиент</th><th>Игра</th><th>Опции</th><th>Итого</th><th>Статус</th></tr></thead>
    <tbody>
    <?php foreach ($rows as $r): $lines = json_decode((string)$r['options_json'], true) ?: []; ?>
      <tr class="st-<?= e($r['status']) ?>">
        <td><?= (int)$r['id'] ?></td>
        <td class="nowrap"><?= e(date('d.m H:i', strtotime($r['created_at']))) ?><?= $r['notified'] ? '' : ' ⚠️' ?></td>
        <td><?= e($r['name']) ?><br><a href="tel:<?= e($r['phone']) ?>"><?= e($r['phone']) ?></a><?= $r['phone_verified'] ? ' ✓' : '' ?></td>
        <td class="nowrap"><?= e($r['play_date'] ?: '—') ?> <?= e($r['play_time'] ?: '') ?><br><?= (int)$r['players'] ?> чел<?= (int)$r['games'] > 1 ? ' · ' . (int)$r['games'] . ' игры' : '' ?><br><span class="muted"><?= e($r['level'] ?: 'уровень на месте') ?></span></td>
        <td><?php $ls = []; foreach ($lines as $l) $ls[] = e($l['label']) . ($l['unit'] === 'hour' ? '×' . (int)$l['qty'] . 'ч' : ''); echo $ls ? implode('<br>', $ls) : '—'; ?><?= $r['comment'] ? '<br><span class="muted">' . e($r['comment']) . '</span>' : '' ?></td>
        <td class="nowrap"><?= rub((int)$r['total']) ?><br><span class="muted">пред. <?= rub((int)$r['prepay']) ?></span></td>
        <td><form method="post" action="/admin.php" class="st-form"><input type="hidden" name="form" value="status"><input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>"><input type="hidden" name="id" value="<?= (int)$r['id'] ?>">
          <select name="status" onchange="this.form.submit()"><?php foreach ($STATUSES as $k => $label): ?><option value="<?= e($k) ?>" <?= $r['status'] === $k ? 'selected' : '' ?>><?= e($label) ?></option><?php endforeach; ?></select>
        </form></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
  <?php endif; ?>
<?php endif; ?>
</main>
</body>
</html>
