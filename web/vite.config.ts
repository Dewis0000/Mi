import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

const api = process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000'

/**
 * Демо-сборка (vite build --mode demo): один самодостаточный HTML для публикации
 * как артефакт — без сервера и внешних запросов. Картинки из public/images
 * подставляются как data URI прямо в код.
 */
function inlinePublicImages(): Plugin {
  const dir = path.resolve(import.meta.dirname, 'public/images')
  const cache = new Map<string, string>()
  const dataUri = (name: string) => {
    if (!cache.has(name)) {
      const ext = path.extname(name).slice(1).replace('jpg', 'jpeg')
      cache.set(name, `data:image/${ext};base64,${fs.readFileSync(path.join(dir, name)).toString('base64')}`)
    }
    return cache.get(name)!
  }
  return {
    name: 'inline-public-images',
    enforce: 'pre',
    transform(code, id) {
      if (!/\/src\/.*\.(tsx?|jsx?)$/.test(id) || !code.includes('/images/')) return
      return code.replace(/(["'])\/images\/([\w-]+\.(?:webp|jpg|png))\1/g, (_m, q: string, name: string) => `${q}${dataUri(name)}${q}`)
    },
  }
}

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo'
  return {
    base: demo ? './' : '/',
    plugins: [react(), tailwindcss(), ...(demo ? [inlinePublicImages()] : [])],
    define: demo ? { 'import.meta.env.VITE_DEMO': JSON.stringify('1') } : undefined,
    resolve: demo ? { alias: { 'hls.js': path.resolve(import.meta.dirname, 'src/demo/hls-stub.ts') } } : undefined,
    build: demo
      ? {
          outDir: 'dist-demo',
          emptyOutDir: true,
          modulePreload: false,
          cssCodeSplit: false,
          assetsInlineLimit: Number.MAX_SAFE_INTEGER,
          chunkSizeWarningLimit: 5000,
          rolldownOptions: { input: path.resolve(import.meta.dirname, 'demo.html'), output: { codeSplitting: false } },
        }
      : // hls.js (~570 КБ) грузится отдельным чанком только на странице трансляции
        { chunkSizeWarningLimit: 700 },
    server: {
      proxy: {
        '/api': { target: api, changeOrigin: true },
        '/uploads': { target: api, changeOrigin: true },
        '/sitemap.xml': { target: api, changeOrigin: true },
      },
    },
    preview: {
      proxy: {
        '/api': { target: api, changeOrigin: true },
        '/uploads': { target: api, changeOrigin: true },
      },
    },
  }
})
