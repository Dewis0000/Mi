import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Ручной manualChunks-сплит (vendor_react/vendor_charts/...) здесь
    // проверялся и был отклонён: Rollup собрал vendor_charts и vendor_react
    // в циклически зависимые чанки, из-за чего recharts в проде обращался
    // к React до его инициализации ("Cannot read properties of undefined
    // (reading '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED')") —
    // рабочий большой бандл лучше сломанного маленького.
    chunkSizeWarningLimit: 2600,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
