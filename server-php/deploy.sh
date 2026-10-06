#!/usr/bin/env bash
# Разворачивает сайт и API на хостинг reg.ru одной командой.
# Скачивает текущую версию из репозитория и раскладывает в корень сайта.
# Можно запускать повторно для обновлений — config.php и база не трогаются.
#
# Запуск на хостинге (ispmanager → Shell-клиент):
#   curl -fsSL https://raw.githubusercontent.com/Dewis0000/Mi/claude/intelligent-dijkstra-skg09q/server-php/deploy.sh | bash
#
# Переопределить корень сайта: DEST=/путь/к/сайту curl ... | bash
set -euo pipefail

REPO="${REPO:-Dewis0000/Mi}"
BRANCH="${BRANCH:-claude/intelligent-dijkstra-skg09q}"
DEST="${DEST:-/var/www/u3661097/data/www/nery-quest.ru}"

echo "→ Корень сайта: $DEST"
if [ ! -d "$DEST" ]; then
  echo "✗ Папка $DEST не найдена. Укажите свою: DEST=/путь curl ... | bash" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ Скачиваю $REPO ($BRANCH)…"
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" -o "$TMP/src.tgz"
tar xzf "$TMP/src.tgz" -C "$TMP"
SRC="$(find "$TMP" -maxdepth 1 -type d -name 'Mi-*' | head -n1)/server-php"

if [ ! -f "$SRC/public/index.html" ] || [ ! -f "$SRC/lib/bootstrap.php" ]; then
  echo "✗ В архиве нет собранного сайта или lib/. Соберите локально (bash server-php/build.sh) и запушьте." >&2
  exit 1
fi

echo "→ Обновляю сайт и API…"
cp -r "$SRC/public/." "$DEST/"      # index.html, assets/, images/, api/, .htaccess
cp -r "$SRC/lib" "$DEST/"           # серверная логика (закрыта от веба через .htaccess)
rm -f "$DEST/router.php"            # нужен только для локального теста

if [ ! -f "$DEST/config.php" ]; then
  SECRET="$(php -r 'echo bin2hex(random_bytes(32));' 2>/dev/null || (head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'))"
  sed "s#ЗАМЕНИТЕ-на-длинную-случайную-строку-не-менее-40-символов#$SECRET#" "$SRC/config.example.php" > "$DEST/config.php"
  echo ""
  echo "⚠  Создан $DEST/config.php (секрет сгенерирован автоматически)."
  echo "   Откройте его и впишите: данные базы MySQL (db), и при желании токены ботов."
  echo "   Без данных базы сайт покажет ошибку подключения."
fi

echo ""
echo "✓ Готово. Сайт и боты обновлены: https://nery-quest.ru"
