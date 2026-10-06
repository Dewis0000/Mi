#!/usr/bin/env bash
# Сборка боевого сайта: React (Vite) → server-php/public/.
# PHP-часть (api/, .htaccess, router.php) не трогаем — только статику React.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/web"
PUB="$ROOT/server-php/public"

echo "→ Сборка React (время площадки: Asia/Yakutsk)…"
cd "$WEB"
VITE_TZ="Asia/Yakutsk" npx vite build

echo "→ Копирование сборки в server-php/public/ …"
# удаляем старую статику (но не PHP и не .htaccess)
rm -rf "$PUB/assets" "$PUB/images"
rm -f "$PUB/index.html" "$PUB/favicon.svg" "$PUB/robots.txt" "$PUB/theme-init.js" "$PUB/og.jpg" 2>/dev/null || true
cp -r "$WEB/dist/." "$PUB/"

echo "✓ Готово. Боевой сайт собран в server-php/public/"
