<?php
// Проверка установки StreOps: php ~/streops-app/check.php
// Показывает, что настроено, а что нет, и подсказывает, как исправить. Ничего не меняет, кроме создания таблиц в базе.
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
if (PHP_VERSION_ID < 80100) { echo "✗ PHP " . PHP_VERSION . " — нужен PHP 8.1 или новее. Запусти так: /opt/php/8.2/bin/php " . __FILE__ . "\n"; exit(1); }
foreach (['pdo', 'curl', 'mbstring', 'json'] as $ext) if (!extension_loaded($ext)) { echo "✗ нет расширения PHP $ext\n"; exit(1); }
require __DIR__ . '/bootstrap.php';

$bad = 0;
$okl = function (string $s) { echo "✓ $s\n"; };
$badl = function (string $s, string $fix = '') use (&$bad) { $bad++; echo "✗ $s\n" . ($fix ? "  → $fix\n" : ''); };
$warn = function (string $s) { echo "! $s\n"; };

echo "StreOps — проверка установки (PHP " . PHP_VERSION . ")\n\n";
if (!is_file(APP_DIR . '/.env')) $badl('нет файла ' . APP_DIR . '/.env', 'cp ' . APP_DIR . '/.env.example ' . APP_DIR . '/.env и заполни его');

$url = base_url();
str_starts_with($url, 'https://') ? $okl("адрес сайта $url") : $badl("APP_URL=$url — нужен https://", 'Twitch принимает вебхуки и вход только по https');
$okl('администратор: ' . admin_login());

try { db(); $okl('база данных: подключение есть, таблицы на месте (' . cfg('DB_DRIVER', 'mysql') . ')'); }
catch (Throwable $e) { $badl('база данных: ' . $e->getMessage(), 'проверь DB_HOST, DB_NAME, DB_USER, DB_PASS в .env'); echo "\nДальше без базы проверять нечего.\n"; exit(1); }

$sec = (string)cfg('EVENTSUB_SECRET');
(strlen($sec) >= 10 && strlen($sec) <= 100) ? $okl('EVENTSUB_SECRET задан') : $badl('EVENTSUB_SECRET должен быть строкой 10–100 символов', 'любая случайная строка, например из: head -c 24 /dev/urandom | od -An -tx1 | tr -d " \\n"');

if (!cfg('TWITCH_CLIENT_ID') || !cfg('TWITCH_CLIENT_SECRET')) {
    $badl('нет TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET', 'dev.twitch.tv/console → твоё приложение');
} else {
    kv_set('tw_app_token', null, 1);
    $t = tw_app_token(true);
    $t ? $okl('Twitch: Client ID и Client Secret верные (токен приложения получен)') : $badl('Twitch не выдал токен приложения', 'проверь TWITCH_CLIENT_ID и TWITCH_CLIENT_SECRET (секрет можно перевыпустить в консоли Twitch)');
    echo "  в консоли Twitch у приложения должен быть OAuth Redirect URL: $url/auth/callback.php\n";
    if ($t) {
        $subs = eventsub_list();
        $by = [];
        foreach ($subs as $s) $by[$s['status']] = ($by[$s['status']] ?? 0) + 1;
        $okl('EventSub: подписок ' . count($subs) . ($by ? ' (' . implode(', ', array_map(fn($k, $v) => "$k: $v", array_keys($by), $by)) . ')' : ''));
    }
}

$b = bot_account();
if (!$b) $badl('аккаунт бота не подключён', "войди на сайт как " . admin_login() . " → Админ-панель → «Подключить аккаунт бота» (в Twitch при этом войти как " . cfg('BOT_LOGIN', 'zaka_bot') . ")");
elseif (empty($b['own_app'])) $warn('бот ' . $b['login'] . ' работает по запасному токену из .env: писать и модерировать может, а читать чат — нет. Подключи бота в админ-панели («Подключить аккаунт бота»)');
else $okl('бот ' . $b['login'] . ' подключён к приложению');

if (cfg('YOUTUBE_API_KEY')) { yt_video('dQw4w9WgXcQ') ? $okl('YouTube API: ключ работает') : $badl('YouTube API: ключ не работает', 'console.cloud.google.com → включи YouTube Data API v3 для проекта ключа, сними ограничения по сайтам/IP'); }
else $warn('YOUTUBE_API_KEY не задан — заказ музыки работать не будет');
cfg('DA_CLIENT_ID') && cfg('DA_CLIENT_SECRET') ? $okl('DonationAlerts: приложение задано (redirect URI в DA: ' . $url . '/auth/da.php)') : $warn('DonationAlerts не настроен — донаты в виджетах и заказ трека донатом не работают');
cfg('FACEIT_API_KEY') ? $okl('FACEIT: ключ задан') : $warn('FACEIT_API_KEY не задан — виджеты FACEIT будут пустыми (необязательно)');

$r = http_request('GET', $url . '/api/index.php?r=me');
($r['code'] === 200 && ($r['json']['ok'] ?? false)) ? $okl('сайт отвечает: ' . $url . '/api/index.php') : $badl('сайт не отвечает на ' . $url . '/api/index.php (код ' . $r['code'] . ')', 'выбери для сайта PHP 8.1+ в ISPmanager (Сайты → streops.ru → изменить → версия PHP) и проверь, что папка server/public скопирована в папку сайта');
$r = http_request('POST', $url . '/bot/eventsub.php', [], ['x' => 1]);
$r['code'] === 403 ? $okl('вебхук EventSub доступен: ' . $url . '/bot/eventsub.php') : $badl('вебхук EventSub отвечает кодом ' . $r['code'] . ' вместо 403', 'Twitch должен достучаться до ' . $url . '/bot/eventsub.php по https');

$last = (int)(kv_get('cron_last') ?? 0);
$last > now() - 300 ? $okl('cron работал ' . (now() - $last) . ' с назад') : $badl('cron не запускался' . ($last ? ' ' . round((now() - $last) / 60) . ' мин' : ''), 'ISPmanager → Планировщик (cron) → каждую минуту: ' . PHP_BINARY . ' ' . APP_DIR . '/cron.php');

echo "\n" . ($bad ? "Есть проблемы: $bad. Исправь отмеченное ✗ и запусти проверку снова.\n" : "Всё готово.\n");
exit($bad ? 1 : 0);
