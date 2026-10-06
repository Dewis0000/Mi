/**
 * Пакет сайта для хостинга с Node.js (например, Node.js-сайт в ispmanager на reg.ru):
 * один процесс отдаёт и API, и фронтенд.
 *
 *   node deploy/build-bundle.mjs            → deploy/out/site/ и deploy/out/chernyhod-site.zip
 *
 * В архиве: dist/ (сервер), prisma/ (схема и миграции), public/ (собранный сайт),
 * package.json со стартом через dist/start.js (миграции + начальные данные + запуск)
 * и шаблон переменных окружения chernyhod.env.example.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, 'deploy/out')
const site = path.join(out, 'site')
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' })

run('npm run build', path.join(root, 'server'))
run('npm run build', path.join(root, 'web'))

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(site, { recursive: true })
const copy = (from, to) => fs.cpSync(path.join(root, from), path.join(site, to), { recursive: true })
copy('server/dist', 'dist')
copy('server/prisma/schema.prisma', 'prisma/schema.prisma')
copy('server/prisma/migrations', 'prisma/migrations')
copy('web/dist', 'public')
copy('server/package-lock.json', 'package-lock.json')

const server = JSON.parse(fs.readFileSync(path.join(root, 'server/package.json'), 'utf8'))
const pkg = {
  name: 'chernyhod-site',
  version: server.version,
  private: true,
  type: 'module',
  engines: { node: '>=22.9' },
  main: 'dist/start.js',
  scripts: {
    // секреты — в файле на два уровня выше папки сайта (вне веб-корня), плюс переменные из панели
    start: 'node --env-file-if-exists=../../chernyhod.env --env-file-if-exists=.env dist/start.js',
    postinstall: 'prisma generate',
  },
  dependencies: server.dependencies,
  overrides: server.overrides,
}
fs.writeFileSync(path.join(site, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')

fs.writeFileSync(
  path.join(site, 'chernyhod.env.example'),
  `# Скопируйте в /var/www/<пользователь>/data/chernyhod.env (на два уровня выше папки сайта)
NODE_ENV=production
TZ=Europe/Moscow
DATABASE_URL=postgresql://ПОЛЬЗОВАТЕЛЬ:ПАРОЛЬ@localhost:5432/БАЗА?schema=public
APP_URL=https://ваш-домен.ru
API_URL=https://ваш-домен.ru
# три длинные случайные строки (например: openssl rand -hex 32)
JWT_ACCESS_SECRET=
SIGNING_SECRET=
INGEST_SECRET=
# главный администратор, создаётся при первом запуске
SEED_OWNER_PHONE=+79990000000
SEED_OWNER_PASSWORD=
# видео и загрузки — вне папки сайта
STORAGE_LOCAL_DIR=../../storage
# пока не подключены Telegram / ВКонтакте / MAX — показывать код подтверждения в форме (только для теста!)
AUTH_SHOW_CODES=1
`,
)

fs.rmSync(path.join(out, 'chernyhod-site.zip'), { force: true })
run(`zip -qr ../chernyhod-site.zip .`, site)
const size = fs.statSync(path.join(out, 'chernyhod-site.zip')).size
console.log(`✓ deploy/out/chernyhod-site.zip — ${(size / 1024 / 1024).toFixed(1)} МБ`)
