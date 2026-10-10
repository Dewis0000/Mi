#!/bin/bash
# StreOps: установка и обновление на хостинге (reg.ru и любой хостинг с PHP 8.1+ и MySQL).
#   bash ~/streops-src/server/install.sh                 — сайт в ~/www/streops.ru
#   bash ~/streops-src/server/install.sh ~/www/другой.ru — другая папка сайта
# Серверная часть ставится в ~/streops-app (вне папки сайта). Файл .env, логи и сессии при обновлении сохраняются.
set -e
SRC=$(cd "$(dirname "$0")/.." && pwd)
SITE=${1:-$HOME/www/streops.ru}
APP=$HOME/streops-app

if [ ! -d "$SITE" ]; then echo "Нет папки сайта: $SITE"; exit 1; fi

# PHP 8.1+ для командной строки (на reg.ru по умолчанию может быть старый php)
PHP=${PHP:-}
[ -z "$PHP" ] && for p in /opt/php/8.3/bin/php /opt/php/8.4/bin/php /opt/php/8.2/bin/php /opt/php/8.1/bin/php php8.3 php8.2 php8.1 /opt/php83/bin/php /opt/php82/bin/php /opt/php81/bin/php /usr/local/bin/php83 /usr/local/bin/php82 php; do
  if command -v "$p" >/dev/null 2>&1 && "$p" -r 'exit(PHP_VERSION_ID >= 80100 ? 0 : 1);' 2>/dev/null; then PHP=$(command -v "$p"); break; fi
done
if [ -z "$PHP" ]; then echo "Не нашёл PHP 8.1+. Посмотри доступные версии: ls /opt/php* — и запусти: PHP=/путь/к/php bash $0"; exit 1; fi
echo "PHP: $PHP ($("$PHP" -r 'echo PHP_VERSION;'))"

# 1. серверная часть
mkdir -p "$APP"
cp -r "$SRC/server/app/." "$APP/"
if [ ! -f "$APP/.env" ]; then
  cp "$APP/.env.example" "$APP/.env"
  SECRET=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  sed -i "s/^EVENTSUB_SECRET=.*/EVENTSUB_SECRET=$SECRET/" "$APP/.env"
  echo "Создан $APP/.env — впиши ключи: nano $APP/.env"
fi
chmod 600 "$APP/.env"

# 2. сайт: страницы и PHP-точки входа
cp -r "$SRC/site/." "$SITE/"
cp -r "$SRC/server/public/." "$SITE/"
echo "Сайт обновлён: $SITE"

# 3. проверка
echo
"$PHP" "$APP/check.php" || true
echo
echo "Строка для планировщика (cron, каждую минуту):"
echo "  $PHP $APP/cron.php"
