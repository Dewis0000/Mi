# Бот-сервис Neru-Квест на Cloudflare Worker

Боты (Telegram + MAX) выносятся на Cloudflare — отдельный всегда-работающий
сервис. Telegram/MAX шлют сообщения прямо на Cloudflare (он для них доступен, в
отличие от reg.ru), а сайт общается с сервисом исходящими запросами. Ничего
перезапускать не нужно.

Файл кода: `worker.js` (в этой папке). Настраивается всё в веб-панели Cloudflare —
командная строка не нужна. Бесплатного тарифа хватает с запасом.

## Шаг 1. Создать Worker
1. Зайдите на https://dash.cloudflare.com (зарегистрируйтесь, если нет аккаунта).
2. Слева **Workers & Pages** → **Create** → **Create Worker**.
3. Имя, например `neru-bot` → **Deploy** (создастся заготовка).
4. **Edit code** → удалите весь пример, вставьте целиком содержимое `worker.js` → **Deploy**.
5. Запомните адрес воркера сверху, вида `https://neru-bot.ВАШ-ПОДДОМЕН.workers.dev`.

## Шаг 2. Хранилище KV (привязки номеров и коды)
1. Слева **Storage & Databases** → **KV** → **Create namespace**, имя например `neru-kv`.
2. Вернитесь в воркер → **Settings** → **Bindings** → **Add binding** → **KV namespace**:
   - Variable name: **KV**
   - KV namespace: выберите `neru-kv`
   - Save.

## Шаг 3. Переменные и секреты
Воркер → **Settings** → **Variables and Secrets** → добавьте (кнопка Add):
| Имя | Значение | Тип |
|-----|----------|-----|
| `TG_TOKEN` | токен Telegram-бота | Secret |
| `MAX_TOKEN` | токен MAX-бота | Secret |
| `WEBHOOK_SECRET` | придумайте длинную строку (буквы/цифры) | Secret |
| `SITE_SECRET` | придумайте другую длинную строку | Secret |
| `TG_USERNAME` | `Neru_kvestBot` | Text |
| `MAX_USERNAME` | `id272499215410_bot` | Text |
| `OWNER_PHONES` | `+79996544460` | Text |

После добавления нажмите **Deploy**, чтобы применились.

## Шаг 4. Подключить сайт к сервису
В `config.php` на reg.ru укажите:
```php
'bot_service_url'    => 'https://neru-bot.ВАШ-ПОДДОМЕН.workers.dev',
'bot_service_secret' => '<то же значение, что SITE_SECRET>',
```

## Шаг 5. Направить ботов на воркер (webhook'и)
Это можно сделать одной ссылкой каждая (подставьте свои значения):
- **Telegram:**
  `https://api.telegram.org/bot<TG_TOKEN>/setWebhook?url=https://neru-bot.ВАШ-ПОДДОМЕН.workers.dev/tg/webhook&secret_token=<WEBHOOK_SECRET>`
  (откройте в браузере — должно вернуть `"ok":true`).
- **MAX:** подписка на `https://neru-bot.ВАШ-ПОДДОМЕН.workers.dev/max/webhook?s=<WEBHOOK_SECRET>`
  (её удобнее поставить запросом; можно попросить меня — пришлите адрес воркера и `WEBHOOK_SECRET`, и я подключу оба).

## Проверка
1. Откройте бота, нажмите «Старт» и поделитесь номером — бот сразу пришлёт код.
2. На сайте введите номер → «Получить код» → код придёт в бот → вход.

## Примечания
- Пока `bot_service_url` задан, сайт НЕ использует локальный приём (cron можно убрать —
  он всё равно работать не будет, пока активен внешний сервис).
- Если смените `WEBHOOK_SECRET` или `SITE_SECRET` — обновите их и в config.php (SITE_SECRET),
  и переустановите webhook'и (WEBHOOK_SECRET).
