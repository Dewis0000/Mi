import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Сборка уходит в папку сайта: /vypendrezhnik/ на streops.ru. Пути относительные, чтобы работало в любой папке.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../site/vypendrezhnik',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
