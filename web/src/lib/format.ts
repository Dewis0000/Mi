export const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`

export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

/**
 * Часовой пояс площадки. Время сеансов всегда показывается и вводится в нём,
 * независимо от часового пояса браузера посетителя.
 */
export const VENUE_TZ = (import.meta.env.VITE_TZ as string | undefined) || 'Europe/Moscow'

/** Дата без времени ('2026-10-07') — полдень UTC, чтобы день не «съезжал» при форматировании */
const toDate = (d: string | Date) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`) : new Date(d))

export const fmtDate = (d: string | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) =>
  toDate(d).toLocaleDateString('ru-RU', { ...opts, timeZone: VENUE_TZ })

export const fmtTime = (d: string | Date) => toDate(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: VENUE_TZ })

export const fmtDateTime = (d: string | Date) =>
  toDate(d).toLocaleString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: VENUE_TZ })

/** Ключ календарной даты из локальных компонентов (для дат, построенных как new Date(y, m, d)) */
export function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: VENUE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Компоненты момента времени в часовом поясе площадки */
export function venueParts(d: Date | string) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(d)).map((x) => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute }
}

/** Дата (YYYY-MM-DD) момента времени по часовому поясу площадки */
export function venueDateKey(d: Date | string) {
  const p = venueParts(d)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

/** ISO → значение для <input type="datetime-local"> во времени площадки */
export function toVenueInput(iso: string) {
  const p = venueParts(iso)
  return `${venueDateKey(iso)}T${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`
}

/** Значение datetime-local (время площадки) → ISO */
export function fromVenueInput(value: string) {
  const [date, time] = value.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const p = venueParts(new Date(guess))
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - guess
  return new Date(guess - offset).toISOString()
}

export function fmtBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} ГБ`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} МБ`
  return `${Math.round(n / 1024)} КБ`
}

export function fmtDuration(sec: number) {
  const m = Math.round(sec / 60)
  return `${m} ${plural(m, ['минута', 'минуты', 'минут'])}`
}

/** Маска +7 (___) ___-__-__ */
export function maskPhone(input: string) {
  let d = input.replace(/\D/g, '')
  if (d.startsWith('8')) d = '7' + d.slice(1)
  if (!d.startsWith('7')) d = '7' + d
  d = d.slice(0, 11)
  const p = d.slice(1)
  let out = '+7'
  if (p.length) out += ' (' + p.slice(0, 3)
  if (p.length >= 3) out += ')'
  if (p.length > 3) out += ' ' + p.slice(3, 6)
  if (p.length > 6) out += '-' + p.slice(6, 8)
  if (p.length > 8) out += '-' + p.slice(8, 10)
  return out
}

export const phoneDigits = (masked: string) => masked.replace(/\D/g, '')
export const isPhoneComplete = (masked: string) => phoneDigits(masked).length === 11

export function formatPhone(p: string) {
  return maskPhone(p)
}

export const FEAR_LEVELS = [
  { label: 'Лёгкий', color: '#4ade80' },
  { label: 'Напряжённый', color: '#facc15' },
  { label: 'Страшный', color: '#fb923c' },
  { label: 'Очень страшный', color: '#ef4444' },
  { label: 'Экстрим', color: '#be123c' },
]

export const STATUS_LABEL: Record<string, string> = {
  NEW: 'Ожидает подтверждения',
  CONFIRMED: 'Подтверждена',
  COMPLETED: 'Завершена',
  CANCELLED: 'Отменена',
  NO_SHOW: 'Неявка',
}

export const STATUS_SHORT: Record<string, string> = {
  NEW: 'Новая',
  CONFIRMED: 'Подтверждена',
  COMPLETED: 'Завершена',
  CANCELLED: 'Отменена',
  NO_SHOW: 'Неявка',
}

export const STATUS_COLOR: Record<string, string> = {
  NEW: 'bg-amber-500/15 text-amber-500 ring-amber-500/30',
  CONFIRMED: 'bg-emerald-500/15 text-emerald-500 ring-emerald-500/30',
  COMPLETED: 'bg-sky-500/15 text-sky-500 ring-sky-500/30',
  CANCELLED: 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/30',
  NO_SHOW: 'bg-rose-500/15 text-rose-500 ring-rose-500/30',
}

export const MESSENGERS = [
  { id: 'TELEGRAM', label: 'Telegram', hint: 'Код придёт от Telegram' },
  { id: 'VK', label: 'ВКонтакте', hint: 'Сообщение от сообщества' },
  { id: 'MAX', label: 'MAX', hint: 'Сообщение от бота MAX' },
] as const
