/**
 * Демо-сборка в один файл: vite build --mode demo, затем CSS и JS встраиваются
 * в HTML, а обёртка <html>/<head>/<body> снимается (её добавляет хостинг артефакта).
 * Результат: dist-demo/chernyhod.html
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'demo'], { stdio: 'inherit' })

const dist = 'dist-demo'
let html = readFileSync(path.join(dist, 'demo.html'), 'utf8')

html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+\.css)"[^>]*>/g, (_m, file) => {
  const css = readFileSync(path.join(dist, file), 'utf8')
  return `<style>\n${css}\n</style>`
})
html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+\.js)"[^>]*><\/script>/g, (_m, file) => {
  // закрывающий тег внутри кода оборвал бы встроенный скрипт
  const js = readFileSync(path.join(dist, file), 'utf8').replace(/<\/script/gi, '<\\/script')
  return `__SCRIPT__${Buffer.from(js).toString('base64')}__`
})

// снимаем обёртку документа; скрипт переносим в конец, после #root
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? ''
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? ''
let scripts = ''
const strip = (s) =>
  s.replace(/__SCRIPT__([A-Za-z0-9+/=]+)__/g, (_m, b64) => {
    scripts += `<script type="module">\n${Buffer.from(b64, 'base64').toString('utf8')}\n</script>\n`
    return ''
  })
const headClean = strip(head).replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '')
const out = `${headClean.trim()}\n${strip(body).trim()}\n${scripts}`

if (out.indexOf('<title>') > 8000) throw new Error('<title> должен быть в первых 8 КБ файла')
writeFileSync(path.join(dist, 'chernyhod.html'), out)
console.log(`✓ ${dist}/chernyhod.html — ${(Buffer.byteLength(out) / 1024 / 1024).toFixed(2)} МБ`)
