#!/usr/bin/env bash
# Готовит сайт к запуску на обычном хостинге reg.ru через ISPmanager —
# без root и без sudo (апи sudo/apt/systemctl/nginx/certbot здесь недоступны).
# Делает только то, что можно сделать из-под обычного SSH-пользователя:
# ставит npm-зависимости, прогоняет миграции БД (MySQL) и собирает
# standalone-сборку Next.js (см. docs/ARCHITECTURE.md, раздел 16).
#
# Привязку домена к Node.js-процессу и его (пере)запуск нужно один раз
# настроить вручную в панели ISPmanager — шаги печатаются в конце скрипта.
#
# Первый запуск и каждый следующий деплой — одна и та же команда:
#   cd ~/nery-quest.ru && git pull && bash server/install.sh
#
# Первый запуск с созданием администратора:
#   ADMIN_PHONE="+79991234567" bash server/install.sh
set -euo pipefail

ADMIN_PHONE="${ADMIN_PHONE:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$APP_DIR"

echo "==> Каталог проекта: $APP_DIR"

# --- 1. .env (создаётся один раз из .env.example; дальше не перезаписывается) ---
if [ ! -f .env ]; then
  echo "==> .env не найден — создаю из .env.example"
  cp .env.example .env
  AUTH_SECRET_VALUE="$(openssl rand -base64 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
  sed -i "s#^AUTH_SECRET=.*#AUTH_SECRET=\"${AUTH_SECRET_VALUE}\"#" .env
  echo ""
  echo "================================================================"
  echo " Откройте .env и заполните как минимум:"
  echo "   DATABASE_URL   — данные MySQL из личного кабинета reg.ru, формат:"
  echo "                    mysql://ЛОГИН:ПАРОЛЬ@localhost:3306/ИМЯ_БАЗЫ"
  echo "   NEXTAUTH_URL        = https://nery-quest.ru"
  echo "   NEXT_PUBLIC_APP_URL = https://nery-quest.ru"
  echo " Затем запустите скрипт ещё раз: bash server/install.sh"
  echo "================================================================"
  exit 0
fi

# --- 2. Зависимости, миграции, сборка ---
echo "==> npm ci"
npm ci

echo "==> Применяю миграции БД"
npx prisma migrate deploy

if [ -n "$ADMIN_PHONE" ]; then
  if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD="$(openssl rand -base64 12)"
    echo "    ADMIN_PASSWORD не указан — сгенерирован автоматически (см. итог ниже)."
  fi
  echo "==> Настраиваю аккаунт администратора"
  ADMIN_PHONE="$ADMIN_PHONE" ADMIN_PASSWORD="$ADMIN_PASSWORD" npm run db:bootstrap
else
  echo "==> ADMIN_PHONE не задан — пропускаю создание администратора и базовой локации."
  echo "    Запустите позже: ADMIN_PHONE='+7...' ADMIN_PASSWORD='...' npm run db:bootstrap"
fi

echo "==> Собираю приложение (next build, output: standalone)"
npm run build

echo "==> Копирую статику в standalone-сборку"
rm -rf .next/standalone/public .next/standalone/.next/static
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
cp -f .env .next/standalone/.env

STANDALONE_DIR="$APP_DIR/.next/standalone"

echo ""
echo "================================================================"
echo " Сборка готова: ${STANDALONE_DIR}/server.js"
echo ""
echo " Один раз вручную в панели ISPmanager (адрес панели — в личном кабинете reg.ru):"
echo "   WWW-домены → nery-quest.ru → «Node.js-приложение» (или «Создать проект»):"
echo "     Корневая директория:  ${STANDALONE_DIR}"
echo "     Файл запуска:         server.js"
echo "     Версия Node.js:       20 или новее"
echo "   Если нет пункта Node.js — напишите в поддержку reg.ru с просьбой"
echo "   включить Node.js для аккаунта (раздел «Настройки → Node.js» в панели)."
echo ""
echo " После каждого обновления кода (после этого скрипта) нажмите «Перезапустить»"
echo " у Node.js-проекта в панели ISPmanager — без этого новая сборка не подхватится."
echo ""
if [ -n "$ADMIN_PHONE" ]; then
  echo " Админ: $ADMIN_PHONE / пароль: $ADMIN_PASSWORD"
  echo " Сохраните пароль — он не выводится повторно."
fi
echo " Локация-заготовка создана — отредактируйте в /admin/locations"
echo " Квесты пока не созданы — добавьте в /admin/rooms"
echo "================================================================"
