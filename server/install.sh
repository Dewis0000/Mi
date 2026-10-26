#!/usr/bin/env bash
# Разворачивает/обновляет сайт на Ubuntu-сервере (reg.ru VPS и т.п.).
# Безопасно запускать повторно — каждый шаг идемпотентен (см. docs/ARCHITECTURE.md, раздел 16).
#
# Первый запуск (пример):
#   ADMIN_PHONE="+79991234567" DOMAIN="nery-quest.ru" bash server/install.sh
# Повторный деплой после git pull — без переменных, они не нужны:
#   bash server/install.sh
set -euo pipefail

# --- Настройки (можно переопределить переменными окружения перед запуском) ---
DOMAIN="${DOMAIN:-nery-quest.ru}"
APP_PORT="${APP_PORT:-3000}"
DB_NAME="${DB_NAME:-quest_club}"
DB_USER="${DB_USER:-quest_app}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
ADMIN_PHONE="${ADMIN_PHONE:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$APP_DIR"

echo "==> Каталог проекта: $APP_DIR"
echo "==> Домен: $DOMAIN"

# --- 1. Системные зависимости (пропускаются, если уже установлены) ---
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/^v//;s/\..*//')" -lt 22 ]; then
  echo "==> Устанавливаю Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "==> Устанавливаю PostgreSQL..."
  sudo apt-get update -y
  sudo apt-get install -y postgresql postgresql-contrib
fi
sudo systemctl enable --now postgresql

if ! command -v nginx >/dev/null 2>&1; then
  echo "==> Устанавливаю Nginx..."
  sudo apt-get install -y nginx
fi
sudo systemctl enable --now nginx

if ! command -v certbot >/dev/null 2>&1; then
  echo "==> Устанавливаю certbot..."
  sudo apt-get install -y certbot python3-certbot-nginx
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> Устанавливаю PM2..."
  sudo npm install -g pm2
fi

# --- 2. База данных (пароль генерируется один раз и сохраняется рядом с проектом) ---
DB_PASS_FILE="$APP_DIR/.db_password"
if [ ! -f "$DB_PASS_FILE" ]; then
  openssl rand -hex 24 > "$DB_PASS_FILE"
  chmod 600 "$DB_PASS_FILE"
fi
DB_PASS="$(cat "$DB_PASS_FILE")"

echo "==> Настраиваю роль и базу данных PostgreSQL..."
sudo -u postgres psql -v ON_ERROR_STOP=1 >/dev/null <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SQL
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1 \
  || sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"

# --- 3. .env (создаётся один раз, при повторных запусках не перезаписывается) ---
if [ ! -f .env ]; then
  echo "==> Создаю .env..."
  cp .env.example .env
  AUTH_SECRET_VALUE="$(openssl rand -base64 32)"
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=\"postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}\"#" .env
  sed -i "s#^AUTH_SECRET=.*#AUTH_SECRET=\"${AUTH_SECRET_VALUE}\"#" .env
  sed -i "s#^NEXTAUTH_URL=.*#NEXTAUTH_URL=\"https://${DOMAIN}\"#" .env
  sed -i "s#^NEXT_PUBLIC_APP_URL=.*#NEXT_PUBLIC_APP_URL=\"https://${DOMAIN}\"#" .env
  echo "    Готово. Оплата (ЮKassa) и вход через соцсети — опциональны, впишите ключи в .env позже."
else
  echo "==> .env уже существует, не трогаю (там ваши ключи)."
fi

# --- 4. Зависимости, миграции, сборка ---
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
  echo "==> ADMIN_PHONE не задан — пропускаю создание администратора и базовой локации/баллов."
  echo "    Запустите позже: ADMIN_PHONE='+7...' ADMIN_PASSWORD='...' npm run db:bootstrap"
fi

echo "==> Собираю приложение"
npm run build

# --- 5. PM2 ---
echo "==> Запускаю через PM2"
pm2 startOrReload server/ecosystem.config.cjs --env production
pm2 save
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$(whoami)" --hp "$HOME" >/dev/null 2>&1 || true

# --- 6. Nginx (создаётся один раз; дальше конфигом управляет certbot) ---
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"
if [ ! -f "$NGINX_CONF" ]; then
  echo "==> Настраиваю Nginx для ${DOMAIN}"
  sudo tee "$NGINX_CONF" > /dev/null <<NGINXCONF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXCONF
  sudo ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/${DOMAIN}"
  sudo nginx -t && sudo systemctl reload nginx
else
  echo "==> Конфигурация Nginx для ${DOMAIN} уже есть, не трогаю."
fi

# --- 7. SSL (не прерывает деплой при неудаче — например, если DNS ещё не настроен) ---
echo "==> Получаю SSL-сертификат (Let's Encrypt)"
if [ -n "$CERTBOT_EMAIL" ]; then
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect || \
    echo "    certbot не отработал — проверьте, что ${DOMAIN} уже указывает на IP этого сервера, и запустите эту команду вручную позже."
else
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || \
    echo "    certbot не отработал — проверьте DNS и запустите вручную: sudo certbot --nginx -d $DOMAIN"
fi

echo ""
echo "================================================================"
echo " Готово: http://${DOMAIN} (или https://, если certbot отработал)"
if [ -n "$ADMIN_PHONE" ]; then
  echo " Админ: $ADMIN_PHONE / пароль: $ADMIN_PASSWORD"
  echo " Сохраните пароль — он не выводится повторно."
fi
echo " Локация-заготовка создана — отредактируйте в /admin/locations"
echo " Квесты пока не созданы — добавьте в /admin/rooms"
echo "================================================================"
