#!/usr/bin/env bash
# Деплой "Один из восьми миллиардов" на хостинг reg.ru / ISPmanager для
# nery-quest.online. Рассчитан именно на этот сайт — не универсальный
# мультисайтовый установщик.
#
# Использование на сервере:
#   первый раз:        git clone <repo-url> ~/nery-src && bash ~/nery-src/server/install.sh
#   каждое обновление:  cd ~/nery-src && git pull && bash server/install.sh
#
# Скрипт НИЧЕГО не знает про пароли/логины — он просто собирает статический
# билд (Vite/React, бэкенда у игры нет) и раскладывает его в докрут домена.
# Node.js нужен только во время сборки, не для раздачи готовых файлов.

set -euo pipefail

DOMAIN="nery-quest.online"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log() { printf '\n\033[1;33m==>\033[0m %s\n' "$1"; }
fail() { printf '\n\033[1;31mОшибка:\033[0m %s\n' "$1" >&2; exit 1; }

log "Репозиторий: ${REPO_ROOT}"
cd "${REPO_ROOT}"

# --- 1. Node.js/npm ---------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  # ISPmanager часто подключает Node.js через nvm или свой менеджер версий,
  # который не всегда есть в PATH неинтерактивного SSH-сеанса — пробуем
  # типичные места перед тем, как сдаться.
  for candidate in \
    "$HOME/.nvm/nvm.sh" \
    "/opt/nvm/nvm.sh" \
    "/usr/local/nvm/nvm.sh"
  do
    if [ -f "$candidate" ]; then
      # shellcheck disable=SC1090
      source "$candidate"
      nvm use --lts >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true
      break
    fi
  done
fi

if ! command -v node >/dev/null 2>&1; then
  fail "node не найден в PATH. В панели ISPmanager включите поддержку Node.js для этого аккаунта (раздел \"Node.js\" / \"WWW-домены\" → Node.js), затем повторите запуск. Текущий PATH: $PATH"
fi

log "node $(node --version), npm $(npm --version)"

# --- 2. Зависимости и сборка -------------------------------------------------
log "Устанавливаю зависимости"
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

log "Собираю билд"
npm run build

[ -d dist ] && [ -f dist/index.html ] || fail "Сборка не создала dist/index.html — смотри вывод npm run build выше."

# --- 3. Докрут домена ---------------------------------------------------------
# Стандартный путь ISPmanager: /var/www/<пользователь>/data/www/<домен>.
# Перебираем несколько типичных вариантов на случай другой конфигурации
# панели, вместо того чтобы молча писать не туда.
CANDIDATE_DOCROOTS=(
  "/var/www/${USER}/data/www/${DOMAIN}"
  "${HOME}/data/www/${DOMAIN}"
  "${HOME}/www/${DOMAIN}"
  "${HOME}/${DOMAIN}/public_html"
  "${HOME}/${DOMAIN}"
)

DOCROOT=""
for candidate in "${CANDIDATE_DOCROOTS[@]}"; do
  if [ -d "$candidate" ]; then
    DOCROOT="$candidate"
    break
  fi
done

if [ -z "$DOCROOT" ]; then
  fail "Не нашёл папку сайта ${DOMAIN} ни по одному из ожидаемых путей:
$(printf '  - %s\n' "${CANDIDATE_DOCROOTS[@]}")
Проверьте в ISPmanager (раздел WWW-домены → ${DOMAIN} → \"Путь\" или \"Домашняя директория\") реальный docroot и либо создайте его, либо допишите его в CANDIDATE_DOCROOTS в этом скрипте."
fi

log "Докрут: ${DOCROOT}"

# --- 4. Публикация -----------------------------------------------------------
log "Копирую dist/ в докрут"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude '.well-known' \
    --exclude '.htaccess' \
    dist/ "${DOCROOT}/"
else
  find "${DOCROOT}" -mindepth 1 -maxdepth 1 \
    ! -name '.well-known' ! -name '.htaccess' -exec rm -rf {} +
  cp -r dist/. "${DOCROOT}/"
fi

# Кэширование статики/SPA-фоллбек не нужен — приложение однострочное (вся
# навигация через состояние, не через роуты), единственный параметр в URL —
# необязательный ?seed=. Добавляем .htaccess только для сжатия/кэша, и
# только если его ещё нет — не перетираем то, что управляет панель/Let's
# Encrypt.
if [ ! -f "${DOCROOT}/.htaccess" ]; then
  cat > "${DOCROOT}/.htaccess" <<'HTACCESS'
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json
</IfModule>
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType text/html "access plus 0 seconds"
</IfModule>
HTACCESS
fi

chmod -R u+rwX,go+rX,go-w "${DOCROOT}" 2>/dev/null || true

log "Готово: https://${DOMAIN}/"
