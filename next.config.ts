import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (PPR) требует оборачивать Suspense почти все динамические
  // данные (сессии, брони, админку) — у нас почти весь сайт динамический,
  // поэтому используем классическую модель рендеринга Next.js.
  // standalone — для деплоя на хостинг без root (ISPmanager и т.п.), см.
  // docs/ARCHITECTURE.md, раздел 16: панель запускает .next/standalone/server.js
  // напрямую, полный node_modules на сервере не нужен.
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
