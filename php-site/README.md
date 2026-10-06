# Neru-Квест — сайт с бронированием (PHP + MySQL)

Полноценный сайт для reg.ru (PHP 8.3 + MySQL): лендинг, онлайн-запись с расчётом
цены (деление больших групп на игры), выбираемые опции, предоплата, проверка
телефона по номеру (Telegram Gateway), уведомления оператору в Telegram/MAX,
админка с настройкой цен и опций.

## Файлы
- `index.php` — лендинг · `booking.php` — запись с расчётом · `admin.php` — панель оператора
- `api.php` — проверка телефона (AJAX) · `content.php` — тексты
- `lib/` — db, helpers, settings, pricing, notify, verify, bootstrap
- `assets/` — styles.css, app.js · `schema.sql` — таблицы · `config.example.php` — шаблон настроек

## Развёртывание (всё в корне сайта)
### 1. Файлы
```
cd ~/data/www/nery-quest.ru && curl -fsSL "https://codeload.github.com/Dewis0000/Mi/tar.gz/refs/heads/claude/intelligent-dijkstra-skg09q" -o /tmp/mi.tgz && tar -xzf /tmp/mi.tgz --strip-components=2 "Mi-claude-intelligent-dijkstra-skg09q/php-site" && rm -f index.html /tmp/mi.tgz && ls -la
```
### 2. База
phpMyAdmin → база `u3661097_default` → «Импорт» → `schema.sql`
(или `mysql -u u3661097_default -p u3661097_default < schema.sql`)
### 3. config.php
```
cp config.example.php config.php
```
Заполнить: `db.pass`; `admin.password_hash` (`php -r "echo password_hash('пароль',PASSWORD_DEFAULT),PHP_EOL;"`);
`telegram.bot_token`+`chat_ids`; `max.bot_token`+`chat_ids`; `prepay`.
### 4. Проверка телефона (по желанию)
Зарегистрировать Telegram Gateway (gatewayapi.telegram.org), вписать `verify.gateway_token`
и `verify.mode = 'gateway'`. Для теста можно `verify.mode = 'mock'` (код показывается на экране).
По умолчанию `off` — без проверки.

## Настройка цен и опций
Админка `/admin.php` → «Настройки цен» (базовая цена, доплата, максимум, предоплата…)
и «Опции» (добавлять/убирать комнату, посуду, шары, надписи — всё считается в итог).

## Безопасность
`config.php` не в репозитории и закрыт в `.htaccess`. Засвеченные токены/пароли — сменить.
