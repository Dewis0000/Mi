# StreOps — запуск на reg.ru

Сайт состоит из двух частей:

| Где | Что |
|---|---|
| `~/www/streops.ru` (папка сайта) | страницы (`site/`) и PHP-точки входа (`server/public/`): вход через Twitch, API, вебхук бота, OBS-виджеты |
| `~/streops-app` (вне папки сайта) | серверная логика (`server/app/`): бот, база, cron, файл `.env` с ключами |

Ключи и пароли хранятся **только** в `~/streops-app/.env` на сервере. В git их нет и быть не должно: репозиторий открыт.

---

## 0. Сначала — безопасность

Пароли от хостинга и ключи (Twitch, YouTube, DonationAlerts, токен бота) были отправлены в чат. Перевыпусти их:

- **reg.ru**: смени пароль хостинга/SSH и пароль базы MySQL (ISPmanager → Базы данных → пользователь → изменить).
- **Twitch-приложение**: dev.twitch.tv/console → приложение → «Новый секрет».
- **Токен бота из twitchtokengenerator**: twitchtokengenerator.com → Revoke (или twitch.tv/settings/connections под streopsbot → отключить). Он больше не нужен: бот подключается через админ-панель.
- **YouTube API-ключ**: console.cloud.google.com → Учётные данные → перевыпустить ключ.

## 1. Разовая настройка

### 1.1. SSL и PHP

1. ISPmanager → **SSL-сертификаты** → «Let's Encrypt» для `streops.ru` и `www.streops.ru`. Без https вход через Twitch и бот работать не будут.
2. ISPmanager → **Сайты** → `streops.ru` → изменить → **версия PHP 8.2** (подойдёт 8.1 и новее), включить «Перенаправлять HTTP на HTTPS» (или раскомментировать 4 строки в `~/www/streops.ru/.htaccess`).

### 1.2. Twitch-приложение

dev.twitch.tv/console → твоё приложение → «Управление»:

- **OAuth Redirect URLs**: `https://streops.ru/auth/callback.php` (ровно так, без слэша в конце);
- **Тип клиента**: «Конфиденциальный»;
- Client ID и новый Client Secret понадобятся для `.env`.

### 1.3. YouTube (заказ музыки)

console.cloud.google.com → API и сервисы → включить **YouTube Data API v3** → создать API-ключ. В ограничениях ключа **не** ставь «HTTP-рефереры»: запросы идут с сервера. Можно ограничить по IP сервера `31.31.196.6` или оставить без ограничений, но с ограничением «только YouTube Data API v3».

### 1.4. DonationAlerts (донаты в виджетах, заказ трека донатом) — по желанию

Токен из виджета DonationAlerts для этого не подходит: нужно OAuth-приложение.

1. donationalerts.com/application/clients → «Создать приложение».
2. Redirect URL: `https://streops.ru/auth/da.php`.
3. ID и ключ приложения → `DA_CLIENT_ID` и `DA_CLIENT_SECRET` в `.env`.
4. Каждый стример потом сам подключает свой DonationAlerts: Настройки → Подключения.

### 1.5. FACEIT — по желанию

developers.faceit.com → App Studio → API Key (Server side) → `FACEIT_API_KEY`.

## 2. Установка

В Shell-клиенте (ISPmanager → «Shell-клиент» или SSH), **по одной команде**:

```bash
cd ~
git clone -b claude/intelligent-carson-o7idc3 https://github.com/dewis0000/mi.git streops-src
```

Если папка `~/streops-src` уже есть (ты клонировал её раньше), вместо этого:

```bash
cd ~/streops-src
git pull
```

Дальше:

```bash
bash ~/streops-src/server/install.sh
```

Скрипт:

- копирует сайт в `~/www/streops.ru`, а серверную часть — в `~/streops-app`;
- при первом запуске создаёт `~/streops-app/.env` и сам вписывает случайный `EVENTSUB_SECRET`;
- запускает проверку и печатает строку для cron.

Если пишет «Не нашёл PHP 8.1+», посмотри версии (`ls /opt/php*`) и укажи путь явно, например:

```bash
PHP=/opt/php/8.2/bin/php bash ~/streops-src/server/install.sh
```

## 3. Ключи в `.env`

```bash
nano ~/streops-app/.env
```

Заполни (значения — свои, после перевыпуска):

```ini
APP_URL=https://streops.ru
ADMIN_LOGIN=zaka_00

DB_DRIVER=mysql
DB_HOST=localhost
DB_NAME=u3661097_default
DB_USER=u3661097_default
DB_PASS=пароль_базы

TWITCH_CLIENT_ID=client_id_приложения
TWITCH_CLIENT_SECRET=секрет_приложения

BOT_LOGIN=streopsbot
BOT_ACCESS_TOKEN=

EVENTSUB_SECRET=(уже вписан скриптом, не трогай)

YOUTUBE_API_KEY=ключ_youtube
DA_CLIENT_ID=
DA_CLIENT_SECRET=
FACEIT_API_KEY=
```

Сохранить в nano: `Ctrl+O`, `Enter`, выйти: `Ctrl+X`. Затем проверка (путь к PHP — тот, что напечатал install.sh):

```bash
/opt/php/8.2/bin/php ~/streops-app/check.php
```

Проверка покажет ✓ или ✗ по каждому пункту и подскажет, что исправить.

## 4. Cron (обязательно)

ISPmanager → **Планировщик (cron)** → «Создать»:

- команда — строка, которую напечатал install.sh, например `/opt/php/8.2/bin/php /var/www/u3661097/data/streops-app/cron.php`;
- расписание: **каждую минуту** (все поля `*`).

Cron обновляет статус эфира и число зрителей, забирает донаты, закрывает сбор в розыгрышах с таймером, продлевает подписки Twitch и чистит старые данные.

## 5. Запуск бота

1. Открой `https://streops.ru`, нажми «Войти через Twitch» и войди как **zaka_00**. В меню появится «Админ-панель» (её видит и открывает только zaka_00: сервер проверяет ник и запоминает Twitch ID при первом входе).
2. Подключи аккаунт бота:
   - в этом же браузере открой twitch.tv, выйди из zaka_00 и войди как **streopsbot**;
   - вернись на `https://streops.ru/admin.html` (в StreOps ты по-прежнему zaka_00) → «Подключить аккаунт бота»;
   - Twitch покажет запрос разрешений для streopsbot → «Разрешить». Вернёт в админ-панель с сообщением «Бот подключён».
3. Подключи бота к каналу: войди в Twitch снова как zaka_00, в StreOps открой «Обзор» или «Настройки» → «Подключить бота». Бот сам станет модератором канала и подпишется на события чата.
4. Напиши в чате канала `!аптайм`. Бот должен ответить за секунду-две.

Каждый стример делает только шаг 3 для своего канала.

## 6. Обновление

```bash
cd ~/streops-src
git pull
bash server/install.sh
```

`.env`, логи и база при обновлении не трогаются.

## 7. OBS

- **Виджеты**: «Виджеты» → включить → «Скопировать ссылку» → в OBS «Источник» → «Браузер», 1920×1080.
- **Плеер музыки**: «Музыка» → «Плеер для OBS» → источник «Браузер» с галочкой «Управлять звуком через OBS».
- **Розыгрыш**: «Розыгрыши» → «Ссылка для OBS».
- **CS2 / Dota 2**: в редакторе виджета есть файл конфигурации Game State Integration — положи его в папку `cfg` игры.

## 8. Если что-то не работает

| Признак | Что делать |
|---|---|
| Любая проблема | `php ~/streops-app/check.php` (через PHP 8) |
| Ошибки сервера | логи в `~/streops-app/logs/` (`api-*.log`, `twitch-*.log`, `eventsub-*.log`, `cron-*.log`) |
| Бот молчит в чате | админ-панель: бот подключён? EventSub: подписки `enabled`? Нет — «Пересоздать подписки». Стример нажал «Подключить бота»? |
| «Аккаунт бота не подключён к приложению» | шаг 5.2 |
| Вход через Twitch: «redirect_mismatch» | в консоли Twitch Redirect URL не совпадает с `https://streops.ru/auth/callback.php` |
| Виджеты не обновляются / нет донатов | cron не запущен (см. шаг 4; в админ-панели видно время последнего запуска) |
| Вместо сайта заглушка reg.ru | удали старый `index.php` из `~/www/streops.ru` |

## Что есть и чего пока нет

- Платформа — только Twitch.
- Музыка играет через плеер YouTube. Ссылки Яндекс Музыки, Spotify, VK и SoundCloud бот превращает в поиск по названию трека на YouTube. Если страница сервиса не отдаёт название, бот попросит ссылку на YouTube.
- Баллы канала для заказа музыки есть только у компаньонов и партнёров Twitch.
- Токсичность определяется по словарям (их можно дополнять своими словами), а не нейросетью.
- Онлайн-оплаты нет: баланс пополняет администратор в админ-панели, тариф покупается с баланса на 30 дней.
- Перед приёмом денег нужны оферта и политика конфиденциальности (152-ФЗ) — их на сайте пока нет.

---

## Для разработки

Исходники страниц — `prototype/src/*.dc.html`, сборка `site/`:

```bash
node prototype/build.mjs
```

Серверная часть запускается локально на SQLite: `DB_DRIVER=sqlite`, `DB_PATH=/путь/data.sqlite` в `.env`.
