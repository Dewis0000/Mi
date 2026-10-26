import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (PPR) требует оборачивать Suspense почти все динамические
  // данные (сессии, брони, админку) — у нас почти весь сайт динамический,
  // поэтому используем классическую модель рендеринга Next.js.
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
