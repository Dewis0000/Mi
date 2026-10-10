# StreOps — выкладка на хостинг reg.ru

Это статический прототип: HTML, CSS и немного JavaScript. Бэкенда нет. Кнопки, вкладки, рулетка и фильтры работают в браузере, но данные демонстрационные и не сохраняются. Подключать Twitch, оплату и бота нужно отдельно.

## Что лежит в репозитории

| Путь | Что это |
|---|---|
| `site/` | Готовый сайт. Это содержимое папки сайта на хостинге |
| `site/index.html` | Главная (лендинг) |
| `site/panel.html` | Стрим-панель |
| `site/commands.html`, `music.html`, `widgets.html`, `widget-faceit.html`, `chat.html`, `moderation.html`, `giveaways.html`, `settings.html` | Разделы панели |
| `site/404.html` + `site/.htaccess` | Страница «не найдено» и настройки Apache |
| `site/design/` | Дизайн-система: цвет, типографика, стекло, движение, код |
| `site/assets/dc-lite.js` | Маленький движок шаблонов страниц |
| `prototype/src/*.dc.html` | Исходники экранов (артборды холста) |
| `prototype/build.mjs` | Сборка `site/` из исходников |
| `design-system/` | Токены: `tokens.css`, `tailwind.config.ts`, `tokens.json` |

Пересобрать сайт после правок в `prototype/src`:

```bash
node prototype/build.mjs
```

## Выкладка через SSH (Shell-клиент)

Понадобятся данные из панели reg.ru («Хостинг» → «Доступы» или письмо с доступами):

- **логин** вида `u1234567`;
- **сервер** вида `server123.hosting.reg.ru`;
- **пароль** от хостинга;
- **папка сайта**: обычно `www/streops.ru` в домашнем каталоге.

Ниже вместо `u1234567`, `server123.hosting.reg.ru` и `www/streops.ru` подставь свои значения.

### Вариант 1. С компьютера одной командой (rsync)

```bash
git clone -b claude/intelligent-carson-o7idc3 https://github.com/dewis0000/mi.git streops
cd streops
rsync -avz --delete site/ u1234567@server123.hosting.reg.ru:www/streops.ru/
```

Слэш в конце `site/` обязателен: так копируется содержимое папки, а не сама папка. Флаг `--delete` удаляет на сервере файлы, которых нет в `site/`. Если в папке сайта лежит что-то ещё, убери этот флаг.

### Вариант 2. Через scp (если rsync нет)

```bash
scp -r site/. u1234567@server123.hosting.reg.ru:www/streops.ru/
```

### Вариант 3. Архивом: загрузить и распаковать на сервере

```bash
# на компьютере
scp streops-site.zip u1234567@server123.hosting.reg.ru:~/

# на сервере
ssh u1234567@server123.hosting.reg.ru
cd ~/www/streops.ru
unzip -o ~/streops-site.zip
rm ~/streops-site.zip
```

### Вариант 4. Клонировать прямо на сервере (если там есть git)

```bash
ssh u1234567@server123.hosting.reg.ru
git clone -b claude/intelligent-carson-o7idc3 https://github.com/dewis0000/mi.git ~/streops-src
cp -r ~/streops-src/site/. ~/www/streops.ru/
```

Обновление потом: `cd ~/streops-src && git pull && cp -r site/. ~/www/streops.ru/`.

## После загрузки проверь

1. Открывается `https://streops.ru/`. Если видишь заглушку reg.ru, удали из папки сайта старый `index.html` или `index.php` и залей файлы ещё раз.
2. Открывается `https://streops.ru/giveaways.html`: рулетка крутится, кнопка «На весь экран» работает.
3. Открывается `https://streops.ru/nesushchestvuyushchaya-stranica`: должна появиться страница 404 StreOps.
4. В панели reg.ru включён SSL-сертификат (бесплатный Let's Encrypt), чтобы сайт открывался по `https://`.

## Шрифты

Onest и JetBrains Mono подгружаются с Google Fonts. Если нужно обойтись без внешних запросов, скачай шрифты в `site/assets/fonts/` и замени строку `<link href="https://fonts.googleapis.com/...">` на свой `@font-face` в каждом исходнике.
