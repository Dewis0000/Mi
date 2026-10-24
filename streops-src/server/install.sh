#!/usr/bin/env bash
# Установка Hearth (чат и звонки) по адресу streops.ru/dsZov/
#
# Запуск из корня репозитория на сервере (Ubuntu/Debian, нужен root или sudo):
#   cd ~/streops-src && git pull && bash ~/streops-src/server/install.sh
#
# Необязательные переменные: PORT=3100 BASE_PATH=/dsZov
# Скрипт повторно запускается без вреда: обновляет зависимости и перезапускает службу.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="streops-dszov"
PORT="${PORT:-3100}"
BASE_PATH="${BASE_PATH:-/dsZov}"
RUN_USER="${RUN_USER:-$(stat -c %U "$APP_DIR")}"
NODE_MIN=18
NODE_INSTALL=20

say() { printf '\n==> %s\n' "$1"; }
fail() { printf '\nОшибка: %s\n' "$1" >&2; exit 1; }

run() {
  if [[ "$(id -u)" -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

command -v curl >/dev/null 2>&1 || fail "нужен curl: apt-get install -y curl"
if [[ "$(id -u)" -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || fail "запусти от root или установи sudo"
fi

# ---------- Node.js
say "Проверяю Node.js"
node_ok() {
  command -v node >/dev/null 2>&1 && [[ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MIN" ]]
}
if ! node_ok; then
  say "Ставлю Node.js $NODE_INSTALL из репозитория NodeSource"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_INSTALL}.x" | run bash -
  run apt-get install -y nodejs
  node_ok || fail "Node.js ${NODE_MIN}+ не установился"
fi
echo "Node $(node -v), npm $(npm -v)"

# ---------- Зависимости
say "Устанавливаю зависимости приложения"
cd "$APP_DIR"
if [[ -f package-lock.json ]]; then
  npm ci --omit=dev --no-audit --no-fund
else
  npm install --omit=dev --no-audit --no-fund
fi

# ---------- Конфиг и данные
say "Готовлю конфиг и папку данных"
mkdir -p data
if [[ ! -f .env ]]; then
  cat > .env <<EOF
# Порт, на котором Node слушает только localhost (наружу его отдаёт nginx)
PORT=$PORT
HOST=127.0.0.1
BASE_PATH=$BASE_PATH
DATA_DIR=$APP_DIR/data
# Необязательно: свой TURN-сервер, если звонки не соединяются через мобильный интернет.
# См. README, раздел «TURN».
# TURN_URLS=turn:turn.streops.ru:3478?transport=udp,turn:turn.streops.ru:3478?transport=tcp
# TURN_USERNAME=hearth
# TURN_CREDENTIAL=длинный-случайный-пароль
EOF
  echo "Создан .env"
else
  echo ".env уже есть, оставляю как есть"
fi
chmod 600 .env
run chown -R "$RUN_USER" data

PORT_IN_USE="$(grep -E '^PORT=' .env | tail -n1 | cut -d= -f2)"
BASE_IN_USE="$(grep -E '^BASE_PATH=' .env | tail -n1 | cut -d= -f2)"
PORT_IN_USE="${PORT_IN_USE:-$PORT}"
BASE_IN_USE="${BASE_IN_USE:-$BASE_PATH}"

# ---------- systemd
say "Служба systemd: $APP_NAME (пользователь $RUN_USER)"
NODE_BIN="$(command -v node)"
run tee "/etc/systemd/system/${APP_NAME}.service" >/dev/null <<EOF
[Unit]
Description=Hearth: чат и звонки на ${BASE_IN_USE}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${NODE_BIN} ${APP_DIR}/server/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=${APP_DIR}/data

[Install]
WantedBy=multi-user.target
EOF
run systemctl daemon-reload
run systemctl enable "$APP_NAME" >/dev/null
run systemctl restart "$APP_NAME"

# ---------- Проверка, что сервер отвечает
say "Проверяю, что сервер отвечает"
healthy=0
for _ in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${PORT_IN_USE}${BASE_IN_USE}/api/health" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 1
done
if [[ "$healthy" -ne 1 ]]; then
  run journalctl -u "$APP_NAME" -n 40 --no-pager || true
  fail "сервер не ответил на 127.0.0.1:${PORT_IN_USE}${BASE_IN_USE}. Смотри лог выше."
fi
echo "Работает на http://127.0.0.1:${PORT_IN_USE}${BASE_IN_USE}/"

# ---------- nginx
say "Nginx: готовлю location ${BASE_IN_USE}/"
SNIPPET="/etc/nginx/snippets/${APP_NAME}.conf"
if command -v nginx >/dev/null 2>&1; then
  run mkdir -p /etc/nginx/snippets
  sed -e "s|__PORT__|${PORT_IN_USE}|g" -e "s|__BASE__|${BASE_IN_USE}|g" \
    "$APP_DIR/server/nginx-dszov.conf.template" | run tee "$SNIPPET" >/dev/null
  echo "Записан $SNIPPET"
  NGINX_READY=1
else
  NGINX_READY=0
  echo "nginx не найден. Установи его: apt-get install -y nginx"
fi

cat <<EOF

============================================================
Установка завершена.

Осталось два шага, их делаешь один раз:

1) Подключи location к сайту streops.ru.
   Открой конфиг сайта (обычно /etc/nginx/sites-enabled/streops.ru или
   /etc/nginx/conf.d/streops.ru.conf) и внутрь блока "server { ... }"
   с HTTPS для streops.ru добавь строку:

       include ${SNIPPET};

   Затем проверь и перезагрузи nginx:

       sudo nginx -t && sudo systemctl reload nginx

2) HTTPS обязателен: без него браузер не даст доступ к микрофону и камере.
   Если сертификата для streops.ru ещё нет:

       sudo apt-get install -y certbot python3-certbot-nginx
       sudo certbot --nginx -d streops.ru

Адрес после этого: https://streops.ru${BASE_IN_USE}/
Логи службы: sudo journalctl -u ${APP_NAME} -f
============================================================
EOF

if [[ "$NGINX_READY" -ne 1 ]]; then
  echo "Внимание: nginx не установлен, шаг 1 пока невозможен."
fi
