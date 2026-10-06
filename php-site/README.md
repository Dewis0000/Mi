# Neru-Квест — рабочий сайт (PHP + MySQL)

Сайт для хостинга reg.ru (PHP 8.3 + MySQL). Лендинг с онлайн-записью: заявки
сохраняются в базу и приходят оператору в Telegram и MAX. Есть панель оператора.

## Состав
- `index.php` — лендинг + форма заявки (сохранение в БД + уведомление в боты)
- `admin.php` — панель оператора (вход по паролю, список заявок, смена статуса)
- `content.php` — тексты и цены (можно свободно редактировать)
- `config.example.php` — шаблон настроек → скопировать в `config.php` на сервере
- `schema.sql` — таблицы MySQL
- `lib/` — подключение к БД, уведомления, хелперы
- `assets/styles.css` — оформление
- `.htaccess` — защита служебных файлов

## Развёртывание (всё в корне сайта `.../www/nery-quest.ru/`)

### 1. Загрузить файлы
Через Shell-клиент панели (скачает архив ветки и положит содержимое `php-site/` в корень сайта):
```
cd ~/data/www/nery-quest.ru && curl -fsSL "https://codeload.github.com/Dewis0000/Mi/tar.gz/refs/heads/claude/intelligent-dijkstra-skg09q" -o /tmp/mi.tgz && tar -xzf /tmp/mi.tgz --strip-components=2 "Mi-claude-intelligent-dijkstra-skg09q/php-site" && rm -f index.html /tmp/mi.tgz && ls -la
```

### 2. Создать базу таблиц
В панели → phpMyAdmin → база `u3661097_default` → вкладка «Импорт» → загрузить `schema.sql`.
(Либо в Shell: `mysql -u u3661097_default -p u3661097_default < schema.sql`)

### 3. Настроить `config.php`
```
cd ~/data/www/nery-quest.ru && cp config.example.php config.php && nano config.php
```
Заполнить:
- `db.pass` — пароль базы;
- `admin.password_hash` — хэш пароля панели. Сгенерировать:
  `php -r "echo password_hash('ПАРОЛЬ', PASSWORD_DEFAULT), PHP_EOL;"`
- `telegram.bot_token`, `telegram.chat_ids` — токен (новый!) и ваш chat_id;
- `max.bot_token`, `max.chat_ids` — токен (новый!) и id чата MAX;
- `prepay` — номер/банк/имя для предоплаты.

### 4. Узнать Telegram chat_id
Напишите своему боту `/start`, затем узнайте свой числовой id у `@userinfobot`
и впишите в `telegram.chat_ids`. Можно указать несколько.

### 5. Проверить
- Открыть сайт → отправить тестовую заявку → проверить, что пришло в бота и видно в `admin.php`.
- Панель: `https://nery-quest.ru/admin.php`

## Безопасность
- `config.php` не попадает в git (см. `.gitignore`) и закрыт в `.htaccess`.
- Токены ботов храните только в `config.php` на сервере. Засвеченные токены — отзовите.
