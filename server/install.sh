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
# Нужен Node 18+ (это минимум для Vite 5) — системный node на таких
# хостингах часто древний (ISPmanager/CloudLinux нередко держат node v10-12
# как системный пакет "для совместимости"), и просто "node есть в PATH"
# недостаточно: старый npm не умеет читать современный package-lock.json и
# падает с непонятными ошибками вместо честного "версия не подходит".
MIN_NODE_MAJOR=18

node_major() {
  "$1" -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null || echo 0
}

node_good_enough() {
  [ "$(node_major "$1")" -ge "$MIN_NODE_MAJOR" ] 2>/dev/null
}

NODE_BIN=""
if command -v node >/dev/null 2>&1 && node_good_enough "$(command -v node)"; then
  NODE_BIN="$(command -v node)"
else
  # Пробуем alt-nodejs (CloudLinux SCL — типично для reg.ru/ISPmanager),
  # отдельные nodevenv-установки ISPmanager и nvm, от новой версии к старой.
  CANDIDATES=()
  for v in 22 20 18; do
    CANDIDATES+=("/opt/alt/alt-nodejs${v}/root/usr/bin/node")
  done
  for d in "$HOME"/nodevenv/*/*/bin/node /opt/nodejs*/bin/node /usr/local/node*/bin/node; do
    CANDIDATES+=("$d")
  done
  for candidate in "${CANDIDATES[@]}"; do
    if [ -x "$candidate" ] && node_good_enough "$candidate"; then
      NODE_BIN="$candidate"
      break
    fi
  done

  if [ -z "$NODE_BIN" ]; then
    for nvmsh in "$HOME/.nvm/nvm.sh" "/opt/nvm/nvm.sh" "/usr/local/nvm/nvm.sh"; do
      if [ -f "$nvmsh" ]; then
        # shellcheck disable=SC1090
        source "$nvmsh"
        nvm install "$MIN_NODE_MAJOR" >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true
        if command -v node >/dev/null 2>&1 && node_good_enough "$(command -v node)"; then
          NODE_BIN="$(command -v node)"
        fi
        break
      fi
    done
  fi
fi

if [ -z "$NODE_BIN" ]; then
  current="(не найден)"
  command -v node >/dev/null 2>&1 && current="$(node --version) по пути $(command -v node)"
  fail "Нужен Node.js ${MIN_NODE_MAJOR}+ (сейчас: ${current} — слишком старый или не найден). В ISPmanager: WWW-домены → ${DOMAIN} → раздел \"Node.js\" → выберите версию ${MIN_NODE_MAJOR} или новее для этого сайта, сохраните, затем запустите установку заново. Если Node.js в ISPmanager уже включён другой версией — допишите путь до его node в CANDIDATES в этом скрипте (проверить можно командой: which -a node)."
fi

export PATH="$(dirname "$NODE_BIN"):$PATH"
log "node $(node --version), npm $(npm --version) ($NODE_BIN)"

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
