/**
 * Демо-сборка в один файл: vite build --mode demo, затем CSS и JS встраиваются в HTML.
 * Результаты:
 *   - deploy/demo/index.html — полный standalone-документ для обычного хостинга (reg.ru и т.п.)
 *   - dist-demo/chernyhod.html — фрагмент без обёртки <html> (её добавляет хостинг артефактов)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'demo'], { stdio: 'inherit' })

const dist = 'dist-demo'
let html = readFileSync(path.join(dist, 'demo.html'), 'utf8')

// встраиваем CSS
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+\.css)"[^>]*>/g, (_m, file) => {
  const css = readFileSync(path.join(dist, file), 'utf8')
  return `<style>\n${css}\n</style>`
})
// встраиваем JS прямо на месте (module-скрипты выполняются после разбора DOM, #root уже существует)
html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+\.js)"[^>]*><\/script>/g, (_m, file) => {
  // закрывающий тег внутри кода оборвал бы встроенный скрипт
  const js = readFileSync(path.join(dist, file), 'utf8').replace(/<\/script/gi, '<\\/script')
  return `<script type="module">\n${js}\n</script>`
})

// 1) полный standalone-документ для обычного хостинга
const outDir = path.join('..', 'deploy', 'demo')
mkdirSync(outDir, { recursive: true })
writeFileSync(path.join(outDir, 'index.html'), html)
console.log(`✓ deploy/demo/index.html — ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} МБ`)

// 2) фрагмент без обёртки документа — для хостинга артефактов
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? ''
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? ''
const headClean = head.replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '')
const frag = `${headClean.trim()}\n${body.trim()}\n`
if (frag.indexOf('<title>') > 8000) throw new Error('<title> должен быть в первых 8 КБ файла')
writeFileSync(path.join(dist, 'chernyhod.html'), frag)
console.log(`✓ ${dist}/chernyhod.html (фрагмент) — ${(Buffer.byteLength(frag) / 1024 / 1024).toFixed(2)} МБ`)
