/**
 * Пререндер главной страницы для поисковиков.
 * Запускает `vite preview` поверх dist/, открывает «/» в headless-браузере
 * (нужен запущенный API — тексты и квесты берутся из него) и сохраняет готовый HTML
 * в dist/index.html. React при загрузке просто перерисует ту же разметку.
 *
 * Использование: npm run build && npm run prerender
 * Требуется playwright: npm i -D playwright (или глобально установленный).
 */
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  console.error('Не найден playwright. Установите: npm i -D playwright && npx playwright install chromium')
  process.exit(1)
}

const PORT = 4173
// vite запускаем напрямую через node, чтобы можно было корректно остановить процесс
const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'inherit' })
const stop = () => preview.kill('SIGTERM')

try {
  // ждём, пока поднимется сервер предпросмотра
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://localhost:${PORT}/`)
      break
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#quests article', { timeout: 15000 })
  // секции с анимацией появления — сразу видимыми, чтобы текст был в разметке без opacity:0
  await page.evaluate(() => document.querySelectorAll('[style*="opacity"]').forEach((el) => el.removeAttribute('style')))
  const html = await page.evaluate(() => '<!doctype html>\n' + document.documentElement.outerHTML)
  await browser.close()

  const original = await readFile('dist/index.html', 'utf8')
  if (!html.includes('id="root"')) throw new Error('Не удалось отрендерить страницу')
  await writeFile('dist/index.html', html)
  await writeFile('dist/index.spa.html', original)
  console.log('✓ dist/index.html пререндерен (исходный шаблон сохранён в dist/index.spa.html)')
} catch (e) {
  console.error('Пререндер не удался:', e.message)
  process.exitCode = 1
} finally {
  stop()
}
