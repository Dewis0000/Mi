#!/usr/bin/env node
/**
 * Клиент API ispmanager (reg.ru и др.) для развёртывания сайта.
 *
 * Переменные окружения:
 *   ISPMANAGER_URL       — адрес API, по умолчанию https://server259.hosting.reg.ru/manager/ispmgr
 *                          (порт 1500 из песочницы Claude закрыт, а /manager/ на 443 работает)
 *   ISPMANAGER_USER      — пользователь панели (u3661097)
 *   ISPMANAGER_PASSWORD  — пароль пользователя панели
 *
 * Команды:
 *   check                         — права, сайты, базы данных, доступные обработчики (есть ли Node.js)
 *   form <func> [ключ=значение]   — описание формы функции (имена полей и варианты выбора)
 *   call <func> [ключ=значение]   — вызвать функцию (для изменений добавьте sok=ok)
 *   upload <локальный файл> <папка на сервере>  — загрузить файл через менеджер файлов
 *
 * Запускать с NODE_USE_ENV_PROXY=1, если исходящие запросы идут через HTTPS_PROXY.
 */
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.ISPMANAGER_URL ?? 'https://server259.hosting.reg.ru/manager/ispmgr'
const USER = process.env.ISPMANAGER_USER ?? 'u3661097'
const PASS = process.env.ISPMANAGER_PASSWORD

if (!PASS) {
  console.error('Задайте ISPMANAGER_PASSWORD в переменных окружения')
  process.exit(1)
}

let session = null

/** Значение из JSON ispmanager: текстовые узлы приходят как {"$": "..."} */
const v = (x) => (x && typeof x === 'object' && '$' in x ? x.$ : x)

async function request(func, params = {}, { body } = {}) {
  const auth = session ? { auth: session } : { authinfo: `${USER}:${PASS}` }
  const form = new URLSearchParams({ out: 'json', lang: 'ru', func, ...auth, ...params })
  const res = body
    ? await fetch(`${BASE}?${form}`, { method: 'POST', body })
    : await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`${func}: не JSON (HTTP ${res.status}): ${text.slice(0, 200)}`)
  }
  const doc = json.doc ?? json
  if (doc.error) {
    const err = new Error(`${func}: ${v(doc.error.msg) ?? JSON.stringify(doc.error)}`)
    err.type = doc.error.$type
    throw err
  }
  return doc
}

/** Вызов с автоматическим переходом на сессию, если authinfo запрещён */
async function call(func, params = {}, opts = {}) {
  try {
    return await request(func, params, opts)
  } catch (e) {
    if (session || !['auth', 'access'].includes(e.type)) throw e
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ out: 'json', func: 'auth', username: USER, password: PASS }),
    })
    const doc = (await res.json()).doc
    const id = v(doc?.auth?.$id) ?? doc?.auth?.$id ?? v(doc?.auth)
    if (!id || doc?.error) throw new Error(`Не удалось войти: ${v(doc?.error?.msg) ?? 'неверный логин или пароль'}`)
    session = id
    return request(func, params, opts)
  }
}

const rows = (doc) => (Array.isArray(doc.elem) ? doc.elem : doc.elem ? [doc.elem] : [])
const flat = (row) => Object.fromEntries(Object.entries(row).map(([k, x]) => [k, v(x)]))
const kv = (args) => Object.fromEntries(args.map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]))

/** Варианты выпадающих списков формы (например, обработчики сайта или типы БД) */
function selects(doc) {
  const out = {}
  for (const s of [].concat(doc.slist ?? [])) {
    out[s.$name] = [].concat(s.val ?? []).map((o) => `${o.$key}${v(o) && v(o) !== o.$key ? ` (${v(o)})` : ''}`)
  }
  return out
}

async function check() {
  const report = async (title, fn) => {
    try {
      console.log(`\n## ${title}`)
      console.log(await fn())
    } catch (e) {
      console.log(`  недоступно: ${e.message}`)
    }
  }
  await report('Сайты (webdomain)', async () => rows(await call('webdomain')).map(flat))
  await report('Базы данных (db)', async () => rows(await call('db')).map(flat))
  await report('Новый сайт: варианты полей (webdomain.edit)', async () => selects(await call('webdomain.edit')))
  await report('Новая база: варианты полей (db.edit)', async () => selects(await call('db.edit')))
  await report('Менеджер файлов (file)', async () => rows(await call('file')).slice(0, 30).map((r) => v(r.name)))
}

async function upload(file, dir) {
  const fd = new FormData()
  fd.append('file', new Blob([fs.readFileSync(file)]), path.basename(file))
  const doc = await call('file.upload', { plid: dir, sok: 'ok' }, { body: fd })
  return doc.ok !== undefined ? 'ok' : doc
}

const [cmd, ...args] = process.argv.slice(2)
try {
  if (cmd === 'check') await check()
  else if (cmd === 'form') console.log(JSON.stringify(await call(args[0], kv(args.slice(1))), null, 2))
  else if (cmd === 'call') console.log(JSON.stringify(await call(args[0], kv(args.slice(1))), null, 2))
  else if (cmd === 'upload') console.log(await upload(args[0], args[1]))
  else console.log('Команды: check | form <func> [k=v] | call <func> [k=v] | upload <файл> <папка>')
} catch (e) {
  console.error('Ошибка:', e.message)
  process.exit(1)
}
