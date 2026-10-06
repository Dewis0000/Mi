/**
 * Эмулятор API для демо-сборки: та же логика, что у сервера (сетка сеансов,
 * блокировки, двойная аренда, скидки, лояльность, роли, отчёты), но данные
 * живут в памяти браузера и сохраняются в localStorage этого посетителя.
 */
import { fromVenueInput, venueDateKey, venueParts } from '../lib/format'

const DAY = 86_400_000
const STORAGE_KEY = 'neru-kvest-db-v1'
const DEMO_SITE = 'https://nery-quest.ru'

/* ------------------------------------------------------------------ типы */

type Messenger = 'TELEGRAM' | 'VK' | 'MAX'
type Status = 'NEW' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'

type Role = { id: string; key: string; name: string; permissions: string[] }
type Schedule = { id: string; weekday: number; timeFrom: string; timeTo: string; breakMin: number }
type Quest = {
  id: string
  slug: string
  title: string
  shortDescription: string
  description: string
  photoUrl: string
  fearLevel: number
  minPlayers: number
  maxPlayers: number
  durationMin: number
  minAge: number
  basePrice: number
  peakExtra: number
  roomNumber: number
  isActive: boolean
  sortOrder: number
  tags: string[]
  schedules: Schedule[]
  createdAt: string
  updatedAt: string
}
type User = {
  id: string
  phone: string
  phoneVerified: boolean
  name: string | null
  birthDate: string | null
  email: string | null
  password: string | null
  points: number
  lastVisitAt: string | null
  roleId: string | null
  blocked: boolean
  messenger: Messenger
  telegramChatId: string | null
  vkUserId: string | null
  maxUserId: string | null
  notifyBookings: boolean
  notifyReminders: boolean
  notifyPromo: boolean
  createdAt: string
}
type Booking = {
  id: string
  userId: string
  questId: string
  startAt: string
  endAt: string
  playersCount: number
  ages: number[]
  status: Status
  source: 'WEB' | 'ADMIN' | 'PHONE' | 'WALK_IN'
  basePrice: number
  discountPercent: number
  discountAmount: number
  promoCode: string | null
  finalPrice: number
  prepaid: number
  comment: string | null
  adminNote: string | null
  isDoubleSession: boolean
  linkedBookingId: string | null
  passed: boolean | null
  timeSpentMin: number | null
  pointsAwarded: boolean
  createdAt: string
}
type Hold = { id: string; questId: string; userId: string; startAt: string; endAt: string; expiresAt: string }
type PointsLog = { id: string; userId: string; delta: number; reason: string; comment: string | null; bookingId: string | null; createdAt: string }
type Recording = {
  id: string
  bookingId: string | null
  roomNumber: number
  fileKey: string
  durationSec: number
  sizeBytes: number
  recordedAt: string
  price: number
  isPurchased: boolean
  purchasedAt: string | null
  expiresAt: string | null
  deleteAfter: string | null
  createdAt: string
}
type Payment = { id: string; userId: string; purpose: 'BOOKING_PREPAY' | 'RECORDING'; entityId: string; amount: number; status: 'PENDING' | 'SUCCEEDED' | 'CANCELED'; provider: string; createdAt: string; paidAt: string | null }
type Promo = { id: string; code: string; isCertificate: boolean; discountPercent: number | null; discountAmount: number | null; validTo: string | null; usesLeft: number | null; isActive: boolean; createdAt: string }
type Code = { phone: string; purpose: string; code: string; attempts: number; expiresAt: number; createdAt: number; consumed: boolean }
type Invite = { token: string; bookingId: string; expiresAt: string }
type Log = { id: string; adminId: string; action: string; entity: string; entityId: string | null; details: unknown; createdAt: string }

const defaultSettings = {
  site: {
    name: 'Neru-Квест',
    tagline: 'Хоррор-квест в реальности · Нерюнгри',
    heroTitle: 'Граф Дракула\nждёт гостей',
    heroText:
      'Хоррор-квест с живым актёром. Тёмные коридоры, загадки и один час, чтобы выбраться. Три уровня сложности выбираете прямо перед игрой. Соберите команду до 7 человек.',
    aboutText:
      'Neru-Квест — квест в реальности в Нерюнгри. Атмосферные декорации, живой актёр и продуманный сюжет. Выберите удобное время, оставьте заявку — и мы свяжемся с вами для подтверждения.',
  },
  contacts: {
    address: 'Нерюнгри, ул. Чурапчинская, 46',
    addressNote: 'Вход с обратной стороны дома, в подвал — сине-белое крыльцо',
    lat: 56.6557,
    lon: 124.7247,
    phone: '+7 924 661-15-20',
    email: '',
    hours: 'Ежедневно, по записи',
    mapUrl: 'https://yandex.ru/maps/org/neru_kvest/211067171529/',
    telegram: '',
    vk: '',
    max: '',
  },
  booking: { prepayMode: 'prepay' as 'none' | 'prepay', prepayPercent: 30, prepayAmount: 500, basePlayers: 5, extraPlayerPrice: 700, holdMinutes: 10, cancelHours: 24, horizonDays: 60 },
  // Дополнительные опции (комната отдыха, оформление) — редактируются в админке
  extras: [
    { id: 'rest', label: 'Комната отдыха', price: 500, unit: 'hour' as 'toggle' | 'hour', requiresRoom: false },
    { id: 'birthday', label: 'Надпись «С днём рождения»', price: 200, unit: 'toggle' as 'toggle' | 'hour', requiresRoom: true },
    { id: 'tableware', label: 'Цветная посуда (на всех)', price: 200, unit: 'toggle' as 'toggle' | 'hour', requiresRoom: true },
    { id: 'balloons', label: 'Воздушные шары (20 шт)', price: 200, unit: 'toggle' as 'toggle' | 'hour', requiresRoom: true },
  ],
  loyalty: {
    pointsPerVisit: 100,
    tiers: [
      { from: 0, percent: 0 },
      { from: 100, percent: 5 },
      { from: 300, percent: 10 },
      { from: 600, percent: 15 },
      { from: 1000, percent: 20 },
    ],
    burnAfterMonths: 6,
    burnPercentPerMonth: 25,
  },
  recordings: { price: 990, linkDays: 30, retentionDays: 60 },
}
type Settings = typeof defaultSettings

type DB = {
  version: 3
  roles: Role[]
  quests: Quest[]
  users: User[]
  bookings: Booking[]
  holds: Hold[]
  points: PointsLog[]
  recordings: Recording[]
  payments: Payment[]
  promos: Promo[]
  codes: Code[]
  invites: Invite[]
  logs: Log[]
  settings: Settings
  sessionUserId: string | null
}

/* ------------------------------------------------------------------ утилиты */

class HttpError {
  status: number
  data: Record<string, unknown>
  constructor(status: number, error: string, code?: string, extra?: Record<string, unknown>) {
    this.status = status
    this.data = { error, code, ...extra }
  }
}
function fail(status: number, error: string, code?: string, extra?: Record<string, unknown>): never {
  throw new HttpError(status, error, code, extra)
}
function notFound(msg = 'Не найдено'): never {
  return fail(404, msg, 'NOT_FOUND')
}
function forbidden(msg = 'Недостаточно прав'): never {
  return fail(403, msg, 'FORBIDDEN')
}
function demoOnly(msg: string): never {
  return fail(400, msg, 'DEMO')
}

let counter = 0
const uid = () => `d${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
const nowIso = () => new Date().toISOString()
const ms = (iso: string) => new Date(iso).getTime()
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null
  let d = input.replace(/\D/g, '')
  if (d.length === 11 && (d.startsWith('8') || d.startsWith('7'))) d = '7' + d.slice(1)
  else if (d.length === 10) d = '7' + d
  else return null
  return '+' + d
}
const phoneOrFail = (v: unknown) => normalizePhone(v) ?? fail(400, 'Неверный формат телефона', 'VALIDATION')

function addMonths(d: Date, months: number) {
  const r = new Date(d)
  r.setMonth(r.getMonth() + months)
  return r
}

/** Дата площадки ± n дней */
function shiftKey(key: string, days: number) {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const weekdayOf = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay()
const atVenue = (key: string, hhmm: string) => new Date(fromVenueInput(`${key}T${hhmm}`))

/* ------------------------------------------------------------------ сетка сеансов */

type Slot = { start: string; end: string; price: number; available: boolean; doubleAvailable: boolean }

function buildGrid(quest: Quest, date: string) {
  const weekday = weekdayOf(date)
  const out: { start: number; end: number; group: number }[] = []
  quest.schedules
    .filter((s) => s.weekday === weekday)
    .forEach((s, group) => {
      const from = atVenue(date, s.timeFrom).getTime()
      let to = atVenue(date, s.timeTo).getTime()
      if (to <= from) to += DAY // работа после полуночи
      const step = (quest.durationMin + s.breakMin) * 60_000
      for (let t = from; t + quest.durationMin * 60_000 <= to; t += step) {
        out.push({ start: t, end: t + quest.durationMin * 60_000, group })
      }
    })
  return out.sort((a, b) => a.start - b.start)
}

function slotPrice(quest: Quest, start: number) {
  const key = venueDateKey(new Date(start))
  const wd = weekdayOf(key)
  const { hh } = venueParts(new Date(start))
  return quest.basePrice + (wd === 0 || wd === 6 || hh >= 17 || hh < 5 ? quest.peakExtra : 0)
}

const ACTIVE: Status[] = ['NEW', 'CONFIRMED']
const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2

function getSlots(db: DB, questId: string, date: string, opts: { userId?: string; exclude?: string[]; ignoreLead?: boolean } = {}): Slot[] {
  const quest = db.quests.find((q) => q.id === questId)
  if (!quest) return []
  const grid = buildGrid(quest, date)
  if (!grid.length) return []
  const busy = [
    ...db.bookings.filter((b) => b.questId === questId && ACTIVE.includes(b.status) && !opts.exclude?.includes(b.id)),
    ...db.holds.filter((h) => h.questId === questId && ms(h.expiresAt) > Date.now() && h.userId !== opts.userId),
  ].map((b) => [ms(b.startAt), ms(b.endAt)] as const)
  const minStart = Date.now() + (opts.ignoreLead ? 0 : 30 * 60_000)
  const base = grid.map((g) => ({
    ...g,
    price: slotPrice(quest, g.start),
    available: g.start >= minStart && !busy.some(([s, e]) => overlaps(g.start, g.end, s, e)),
  }))
  return base.map((s, i) => {
    const next = base[i + 1]
    return {
      start: new Date(s.start).toISOString(),
      end: new Date(s.end).toISOString(),
      price: s.price,
      available: s.available,
      doubleAvailable: s.available && !!next && next.group === s.group && next.available,
    }
  })
}

function resolveSlots(db: DB, questId: string, startAt: string, double: boolean, opts: { userId?: string; exclude?: string[]; ignoreLead?: boolean } = {}) {
  const t = ms(startAt)
  if (Number.isNaN(t)) fail(400, 'Некорректное время', 'VALIDATION')
  const key = venueDateKey(new Date(t))
  for (const date of [key, shiftKey(key, -1)]) {
    const slots = getSlots(db, questId, date, opts)
    const idx = slots.findIndex((s) => ms(s.start) === t)
    if (idx === -1) continue
    const first = slots[idx]
    if (!first.available) return null
    if (!double) return [first]
    if (!first.doubleAvailable) return null
    return [first, slots[idx + 1]]
  }
  return null
}

/* ------------------------------------------------------------------ лояльность и цены */

function tierFor(points: number, loyalty: Settings['loyalty']) {
  const tiers = [...loyalty.tiers].sort((a, b) => a.from - b.from)
  let current = tiers[0]
  let next: (typeof tiers)[number] | null = null
  tiers.forEach((t, i) => {
    if (points >= t.from) {
      current = t
      next = tiers[i + 1] ?? null
    }
  })
  return { percent: current.percent, next }
}

function nextBurnDate(lastVisitAt: string | null, lastBurnAt: string | null, loyalty: Settings['loyalty']) {
  if (!lastVisitAt) return null
  const first = addMonths(new Date(lastVisitAt), loyalty.burnAfterMonths)
  if (first.getTime() > Date.now()) return first
  if (lastBurnAt && ms(lastBurnAt) > ms(lastVisitAt)) return addMonths(new Date(lastBurnAt), 1)
  return first
}

function findPromo(db: DB, code?: unknown) {
  if (!code || typeof code !== 'string') return null
  const promo = db.promos.find((p) => p.code === code.trim().toUpperCase())
  if (!promo || !promo.isActive) fail(400, 'Промокод не найден', 'PROMO_INVALID')
  if (promo!.validTo && ms(promo!.validTo) < Date.now()) fail(400, 'Срок действия промокода истёк', 'PROMO_EXPIRED')
  if (promo!.usesLeft !== null && promo!.usesLeft <= 0) fail(400, 'Промокод уже использован', 'PROMO_USED')
  return promo
}

function quote(db: DB, slotPrices: number[], user: User | null, promoCode?: unknown, opts: { players?: number; double?: boolean; extras?: unknown } = {}) {
  const s = db.settings
  const gamesBase = slotPrices.reduce((a, b) => a + b, 0)
  const players = Math.max(1, opts.players ?? 0)
  // доплата за игроков сверх базовых — только в одиночной игре (при делении цена уже по играм)
  const playersExtra = opts.double ? 0 : s.booking.extraPlayerPrice * Math.max(0, players - s.booking.basePlayers)
  // выбранные опции: массив id или {id, qty}
  const picks = Array.isArray(opts.extras) ? (opts.extras as unknown[]) : []
  const pickId = (x: unknown) => (x && typeof x === 'object' ? (x as { id?: unknown }).id : x)
  // декор (requiresRoom) доступен только если выбрана комната отдыха (опция с оплатой за час)
  const roomSelected = picks.some((x) => s.extras.find((o) => o.id === pickId(x))?.unit === 'hour')
  const extras = picks
    .map((x) => {
      const id = pickId(x)
      const qty = x && typeof x === 'object' ? Math.max(1, Number((x as { qty?: unknown }).qty) || 1) : 1
      const e = s.extras.find((o) => o.id === id)
      if (!e) return null
      if (e.requiresRoom && !roomSelected) return null
      return { label: e.label + (e.unit === 'hour' ? ` ×${qty} ч` : ''), price: e.unit === 'hour' ? e.price * qty : e.price }
    })
    .filter(Boolean) as { label: string; price: number }[]
  const extrasTotal = extras.reduce((a, b) => a + b.price, 0)

  const basePrice = gamesBase + playersExtra + extrasTotal
  const loyaltyPercent = user ? tierFor(user.points, s.loyalty).percent : 0
  const promo = findPromo(db, promoCode)
  const percent = Math.min(50, loyaltyPercent + (promo?.discountPercent ?? 0))
  const discountAmount = Math.min(basePrice, Math.round((basePrice * percent) / 100) + (promo?.discountAmount ?? 0))
  const finalPrice = basePrice - discountAmount
  const prepay = s.booking.prepayMode === 'prepay' ? Math.min(s.booking.prepayAmount, finalPrice) : 0
  return {
    basePrice, gamesBase, playersExtra, extrasTotal, extras,
    loyaltyPercent,
    promo: promo ? { code: promo.code, isCertificate: promo.isCertificate, percent: promo.discountPercent, amount: promo.discountAmount } : null,
    discountPercent: percent,
    discountAmount,
    finalPrice,
    prepay,
  }
}

/* ------------------------------------------------------------------ сериализация */

const roleOf = (db: DB, u: User) => db.roles.find((r) => r.id === u.roleId) ?? null
const perms = (db: DB, u: User | null) => (u ? roleOf(db, u)?.permissions ?? [] : [])
const can = (db: DB, u: User | null, p: string) => perms(db, u).includes(p)

function serializeUser(db: DB, u: User) {
  const p = perms(db, u)
  return {
    id: u.id,
    phone: u.phone,
    phoneVerified: u.phoneVerified,
    name: u.name,
    birthDate: u.birthDate,
    email: u.email,
    points: u.points,
    messenger: u.messenger,
    linked: { telegram: !!u.telegramChatId, vk: !!u.vkUserId, max: !!u.maxUserId },
    notify: { bookings: u.notifyBookings, reminders: u.notifyReminders, promo: u.notifyPromo },
    hasPassword: !!u.password,
    isStaff: p.length > 0,
    permissions: p,
    roleName: p.includes('roles.manage') ? roleOf(db, u)?.name : undefined,
    createdAt: u.createdAt,
  }
}

const publicQuest = (q: Quest) => {
  const { schedules: _s, roomNumber: _r, isActive: _a, sortOrder: _o, createdAt: _c, updatedAt: _u, ...rest } = q
  return rest
}

function bookingView(db: DB, b: Booking, withUser = false) {
  const q = db.quests.find((x) => x.id === b.questId)!
  const u = db.users.find((x) => x.id === b.userId)!
  const linked = b.linkedBookingId ? db.bookings.find((x) => x.id === b.linkedBookingId) : null
  return {
    ...b,
    quest: { id: q.id, slug: q.slug, title: q.title, photoUrl: q.photoUrl, durationMin: q.durationMin, roomNumber: q.roomNumber, fearLevel: q.fearLevel },
    linkedBooking: linked ? { id: linked.id, startAt: linked.startAt, endAt: linked.endAt } : null,
    ...(withUser ? { user: { id: u.id, name: u.name, phone: u.phone, points: u.points, blocked: u.blocked } } : {}),
  }
}

/** Второй сеанс двойной аренды — служебная запись */
const isSecond = (db: DB, b: Booking) => db.bookings.some((x) => x.linkedBookingId === b.id)

/* ------------------------------------------------------------------ сид */

const PERMS = [
  'dashboard.view',
  'bookings.view',
  'bookings.edit',
  'users.view',
  'users.edit',
  'points.edit',
  'quests.edit',
  'content.edit',
  'recordings.manage',
  'reports.view',
  'payments.view',
  'promo.edit',
  'settings.edit',
  'logs.view',
  'roles.manage',
]
const PERM_LABELS: Record<string, string> = {
  'dashboard.view': 'Дашборд',
  'bookings.view': 'Просмотр заявок',
  'bookings.edit': 'Редактирование заявок',
  'users.view': 'Просмотр пользователей',
  'users.edit': 'Работа с пользователями',
  'points.edit': 'Корректировка баллов',
  'quests.edit': 'Управление квестами',
  'content.edit': 'Тексты и контакты',
  'recordings.manage': 'Видеозаписи',
  'reports.view': 'Отчётность',
  'payments.view': 'Платежи',
  'promo.edit': 'Промокоды и сертификаты',
  'settings.edit': 'Настройки записи и лояльности',
  'logs.view': 'Журнал действий',
  'roles.manage': 'Управление ролями',
}

const allWeek = (timeFrom: string, timeTo: string, breakMin: number): Schedule[] =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ id: uid(), weekday, timeFrom, timeTo, breakMin }))

function seed(): DB {
  const created = nowIso()
  const roles: Role[] = [
    { id: uid(), key: 'owner', name: 'Главный администратор', permissions: [...PERMS] },
    { id: uid(), key: 'deputy', name: 'Заместитель администратора', permissions: PERMS.filter((p) => p !== 'roles.manage') },
    { id: uid(), key: 'accountant', name: 'Бухгалтер', permissions: ['dashboard.view', 'bookings.view', 'reports.view', 'payments.view'] },
    { id: uid(), key: 'operator', name: 'Оператор / администратор зала', permissions: ['dashboard.view', 'bookings.view', 'bookings.edit', 'users.view', 'users.edit', 'recordings.manage'] },
  ]
  const q = (data: Omit<Quest, 'id' | 'createdAt' | 'updatedAt'>): Quest => ({ ...data, id: uid(), createdAt: created, updatedAt: created })
  const quests: Quest[] = [
    q({
      slug: 'graf-drakula',
      title: 'Граф Дракула',
      shortDescription: 'Старый замок проснулся. У вас есть час, чтобы разгадать его тайны и выбраться — пока хозяин не нашёл вас первым.',
      description:
        'Атмосферный хоррор-квест с живым актёром по мотивам легенды о Графе Дракуле. Тёмные коридоры, загадки, спрятанные механизмы и актёр, который ведёт историю.\n\nТри уровня сложности и взаимодействия с актёром выбираются прямо перед игрой — под настроение вашей команды: от спокойного (минимум контакта, атмосферно) до хардкора (максимум взаимодействия, по-настоящему жутко).\n\nЦена: 3500 ₽ за команду до 5 человек, каждый следующий игрок +700 ₽ (максимум 7). Для записи — предоплата 500 ₽; возврат при отмене минимум за сутки. Приходите за 10 минут до игры, с собой — чистая сменная обувь.',
      photoUrl: '/images/crypt.webp',
      fearLevel: 4,
      minPlayers: 1,
      maxPlayers: 7,
      durationMin: 60,
      minAge: 12,
      basePrice: 3500,
      peakExtra: 0,
      roomNumber: 1,
      isActive: true,
      sortOrder: 1,
      tags: ['живой актёр', '3 уровня сложности', '~1 час'],
      schedules: allWeek('10:00', '22:00', 20),
    }),
  ]
  const byslug = (s: string) => quests.find((x) => x.slug === s)!

  const user = (data: Partial<User> & { phone: string }): User => ({
    id: uid(),
    phoneVerified: true,
    name: null,
    birthDate: null,
    email: null,
    password: null,
    points: 0,
    lastVisitAt: null,
    roleId: null,
    blocked: false,
    messenger: 'TELEGRAM',
    telegramChatId: null,
    vkUserId: null,
    maxUserId: null,
    notifyBookings: true,
    notifyReminders: true,
    notifyPromo: false,
    createdAt: new Date(Date.now() - 200 * DAY).toISOString(),
    ...data,
  })
  const role = (k: string) => roles.find((r) => r.key === k)!.id
  const users: User[] = [
    user({ phone: '+79996544460', name: 'Владелец', password: 'admin12345', roleId: role('owner') }),
    user({ phone: '+79990000011', name: 'Марина', password: 'deputy12345', roleId: role('deputy') }),
    user({ phone: '+79990000012', name: 'Ольга', password: 'account12345', roleId: role('accountant') }),
    user({ phone: '+79990000013', name: 'Денис', password: 'operator12345', roleId: role('operator') }),
  ]
  const db: DB = {
    version: 3,
    roles,
    quests,
    users,
    bookings: [],
    holds: [],
    points: [],
    recordings: [],
    payments: [],
    promos: [
      { id: uid(), code: 'STRAH10', isCertificate: false, discountPercent: 10, discountAmount: null, validTo: new Date(Date.now() + 365 * DAY).toISOString(), usesLeft: null, isActive: true, createdAt: created },
      { id: uid(), code: 'GIFT-DEMO', isCertificate: true, discountPercent: null, discountAmount: 3000, validTo: null, usesLeft: 1, isActive: true, createdAt: created },
    ],
    codes: [],
    invites: [],
    logs: [],
    settings: clone(defaultSettings),
    sessionUserId: null,
  }

  const today = venueDateKey(new Date())
  /** n-й сеанс дня (с конца, если n < 0) */
  const slotAt = (quest: Quest, daysFromNow: number, n: number) => {
    const grid = buildGrid(quest, shiftKey(today, daysFromNow))
    const g = grid[(n + grid.length) % grid.length]
    return { start: new Date(g.start).toISOString(), end: new Date(g.end).toISOString() }
  }
  const book = (u: User, quest: Quest, slot: { start: string; end: string }, data: Partial<Booking>): Booking => {
    const price = slotPrice(quest, ms(slot.start))
    const b: Booking = {
      id: uid(),
      userId: u.id,
      questId: quest.id,
      startAt: slot.start,
      endAt: slot.end,
      playersCount: quest.minPlayers + 1,
      ages: [24, 31],
      status: 'CONFIRMED',
      source: 'WEB',
      basePrice: price,
      discountPercent: 0,
      discountAmount: 0,
      promoCode: null,
      finalPrice: price,
      prepaid: 0,
      comment: null,
      adminNote: null,
      isDoubleSession: false,
      linkedBookingId: null,
      passed: null,
      timeSpentMin: null,
      pointsAwarded: false,
      createdAt: new Date(ms(slot.start) - 5 * DAY).toISOString(),
      ...data,
    }
    db.bookings.push(b)
    return b
  }

  // Демо-клиент с историей, баллами и видео
  const anna = user({ phone: '+79990000002', name: 'Анна', email: 'anna@example.com', password: 'demo12345', points: 300 })
  users.push(anna)
  const past = [
    { slug: 'graf-drakula', days: -120, n: 5, passed: true, time: 48, bought: false },
    { slug: 'graf-drakula', days: -60, n: 6, passed: false, time: 60, bought: false },
    { slug: 'graf-drakula', days: -20, n: 2, passed: true, time: 55, bought: true },
  ]
  for (const p of past) {
    const quest = byslug(p.slug)
    const b = book(anna, quest, slotAt(quest, p.days, p.n), { status: 'COMPLETED', playersCount: 4, passed: p.passed, timeSpentMin: p.time, pointsAwarded: true })
    db.points.push({ id: uid(), userId: anna.id, delta: 100, reason: 'VISIT', comment: `Квест «${quest.title}»`, bookingId: b.id, createdAt: b.startAt })
    db.recordings.push({
      id: uid(),
      bookingId: b.id,
      roomNumber: quest.roomNumber,
      fileKey: `recordings/room${quest.roomNumber}/demo-${b.id}.mp4`,
      durationSec: p.time * 60,
      sizeBytes: 1_450_000_000 + p.time * 10_000_000,
      recordedAt: b.startAt,
      price: 990,
      isPurchased: p.bought,
      purchasedAt: p.bought ? new Date(ms(b.startAt) + DAY).toISOString() : null,
      expiresAt: p.bought ? new Date(ms(b.startAt) + 31 * DAY).toISOString() : null,
      deleteAfter: new Date(ms(b.startAt) + 180 * DAY).toISOString(),
      createdAt: b.startAt,
    })
    anna.lastVisitAt = b.startAt
  }
  const pepel = byslug('graf-drakula')
  const upcoming = slotAt(pepel, 3, 6)
  const upBase = slotPrice(pepel, ms(upcoming.start))
  book(anna, pepel, upcoming, {
    playersCount: 5,
    ages: [22, 31],
    basePrice: upBase,
    discountPercent: 10,
    discountAmount: Math.round(upBase * 0.1),
    finalPrice: upBase - Math.round(upBase * 0.1),
    comment: 'День рождения у Кати 🎂',
  })

  // Сеанс, который идёт прямо сейчас — чтобы показать онлайн-трансляцию
  const nowMs = Date.now()
  for (const quest of quests.filter((x) => x.isActive)) {
    const live = [shiftKey(today, -1), today]
      .flatMap((d) => buildGrid(quest, d))
      .find((g) => g.start <= nowMs && g.end > nowMs + 5 * 60_000)
    if (live) {
      book(anna, quest, { start: new Date(live.start).toISOString(), end: new Date(live.end).toISOString() }, { playersCount: 4, ages: [25, 29], comment: 'Смотрят друзья из лобби' })
      break
    }
  }

  // Другие клиенты — для календаря, дашборда и отчётов
  const guests = [
    { phone: '+79161112233', name: 'Игорь' },
    { phone: '+79035554433', name: 'Светлана' },
    { phone: '+79267778899', name: 'Тимур' },
  ]
  const active = quests.filter((x) => x.isActive)
  guests.forEach((g, i) => {
    const u = user({ phone: g.phone, name: g.name, createdAt: new Date(Date.now() - (40 - i * 7) * DAY).toISOString() })
    users.push(u)
    for (let k = 0; k < 5; k++) {
      const quest = active[(i + k) % active.length]
      const offset = (k - 2) * 2 + i
      const slot = slotAt(quest, offset, 2 + ((i * 3 + k) % 5))
      if (db.bookings.some((b) => b.questId === quest.id && overlaps(ms(b.startAt), ms(b.endAt), ms(slot.start), ms(slot.end)))) continue
      const status: Status = ms(slot.end) < Date.now() ? (k === 0 && i === 2 ? 'NO_SHOW' : 'COMPLETED') : k === 3 ? 'NEW' : 'CONFIRMED'
      book(u, quest, slot, { status, source: k % 2 ? 'PHONE' : 'WEB', pointsAwarded: status === 'COMPLETED', passed: status === 'COMPLETED' ? k % 2 === 0 : null, timeSpentMin: status === 'COMPLETED' ? 50 + k * 4 : null })
      if (status === 'COMPLETED') {
        u.points += 100
        u.lastVisitAt = slot.start
        db.points.push({ id: uid(), userId: u.id, delta: 100, reason: 'VISIT', comment: `Квест «${quest.title}»`, bookingId: null, createdAt: slot.start })
      }
    }
  })
  return db
}

/* ------------------------------------------------------------------ хранилище */

let db: DB | null = null

function load(): DB {
  if (db) return db
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DB
      if (parsed.version === 3 && parsed.settings) {
        // подстраховка на случай новых полей настроек/опций — дополняем значениями по умолчанию
        parsed.settings.booking = { ...defaultSettings.booking, ...parsed.settings.booking }
        if (!Array.isArray(parsed.settings.extras)) parsed.settings.extras = clone(defaultSettings.extras)
        db = parsed
      }
    }
  } catch {
    /* хранилище недоступно — работаем в памяти */
  }
  if (!db) db = seed()
  return db
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    /* без сохранения между перезагрузками */
  }
}

/** Сброс демо-данных к исходному состоянию */
export function resetDemo() {
  db = seed()
  save()
}

/* ------------------------------------------------------------------ авторизация */

type Ctx = { db: DB; user: User | null; body: Record<string, unknown>; query: Record<string, string>; params: Record<string, string> }

function requireUser(c: Ctx) {
  if (!c.user) fail(401, 'Требуется авторизация', 'UNAUTHORIZED')
  if (c.user!.blocked) fail(403, 'Аккаунт заблокирован. Свяжитесь с администратором.', 'BLOCKED')
  return c.user!
}
function requirePerm(c: Ctx, ...ps: string[]) {
  const u = requireUser(c)
  if (!perms(c.db, u).length) forbidden()
  if (!ps.every((p) => can(c.db, u, p))) forbidden()
  return u
}
function adminLog(c: Ctx, action: string, entity: string, entityId: string | null, details?: unknown) {
  c.db.logs.unshift({ id: uid(), adminId: c.user!.id, action, entity, entityId, details: details === undefined ? null : clone(details), createdAt: nowIso() })
}

function session(db: DB, u: User) {
  db.sessionUserId = u.id
  return { accessToken: `demo.${u.id}`, expiresIn: 900, user: serializeUser(db, u), needsProfile: !u.name }
}

function issueCode(db: DB, phone: string, purpose: string) {
  const since = Date.now() - 10 * 60_000
  const recent = db.codes.filter((x) => x.phone === phone && x.createdAt > since).sort((a, b) => b.createdAt - a.createdAt)
  if (recent.length >= 3) {
    const retryIn = Math.ceil((recent[recent.length - 1].createdAt + 10 * 60_000 - Date.now()) / 1000)
    fail(429, 'Слишком много запросов кода. Попробуйте позже.', 'RATE_LIMIT', { retryIn })
  }
  if (recent[0] && Date.now() - recent[0].createdAt < 60_000) {
    fail(429, 'Код уже отправлен. Подождите перед повторной отправкой.', 'RESEND_WAIT', { retryIn: Math.ceil((recent[0].createdAt + 60_000 - Date.now()) / 1000) })
  }
  const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
  db.codes.push({ phone, purpose, code, attempts: 0, expiresAt: Date.now() + 5 * 60_000, createdAt: Date.now(), consumed: false })
  return { resendIn: 60, devCode: code }
}

function consumeCode(db: DB, phone: string, code: unknown, purpose: string) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) fail(400, 'Код — 6 цифр', 'VALIDATION')
  const rec = db.codes.filter((x) => x.phone === phone && x.purpose === purpose && !x.consumed && x.expiresAt > Date.now()).sort((a, b) => b.createdAt - a.createdAt)[0]
  if (!rec) fail(400, 'Код истёк или не запрашивался. Запросите новый.', 'CODE_EXPIRED')
  if (rec.attempts >= 5) fail(400, 'Превышено число попыток. Запросите новый код.', 'CODE_ATTEMPTS')
  if (rec.code !== code) {
    rec.attempts++
    fail(400, 'Неверный код', 'CODE_INVALID', { attemptsLeft: 5 - rec.attempts })
  }
  rec.consumed = true
}

/* ------------------------------------------------------------------ запись */

function validatePlayers(quest: Quest, players: number, ages: number[], double: boolean) {
  if (!Number.isInteger(players) || players < 1) fail(400, 'Укажите количество игроков', 'VALIDATION')
  if (players < quest.minPlayers) fail(400, `Минимум игроков для этого квеста — ${quest.minPlayers}`, 'PLAYERS_MIN')
  if (players > quest.maxPlayers) {
    if (!double) fail(400, `Максимум игроков — ${quest.maxPlayers}. Можно арендовать два сеанса подряд.`, 'PLAYERS_OVER_LIMIT')
    if (players > quest.maxPlayers * 2) fail(400, `Даже на два сеанса — не более ${quest.maxPlayers * 2} игроков`, 'PLAYERS_DOUBLE_MAX')
  } else if (double) fail(400, 'Двойной сеанс доступен, только если игроков больше максимума', 'DOUBLE_NOT_NEEDED')
  if (!ages.length) fail(400, 'Укажите возраст игроков', 'AGES_REQUIRED')
  if (Math.min(...ages) < quest.minAge) fail(400, `Квест доступен с ${quest.minAge} лет`, 'AGE_RESTRICTED')
}

function createBooking(
  c: Ctx,
  user: User,
  quest: Quest,
  o: { startAt: string; players: number; ages: number[]; double: boolean; comment?: string | null; promoCode?: unknown; extras?: unknown; source?: Booking['source']; ignoreLead?: boolean; finalPrice?: number },
) {
  validatePlayers(quest, o.players, o.ages, o.double)
  const slots = resolveSlots(c.db, quest.id, o.startAt, o.double, { userId: user.id, ignoreLead: o.ignoreLead })
  if (!slots) fail(409, 'Это время уже занято. Выберите другой сеанс.', 'SLOT_TAKEN')
  const price = quote(c.db, slots!.map((s) => s.price), user, o.promoCode, { players: o.players, double: o.double, extras: o.extras })
  const finalPrice = o.finalPrice ?? price.finalPrice
  const extrasNote = price.extras.length ? 'Опции: ' + price.extras.map((e) => e.label).join(', ') : ''
  const fullComment = [o.comment, extrasNote].filter(Boolean).join(' · ') || null
  const base = {
    userId: user.id,
    questId: quest.id,
    playersCount: o.players,
    ages: o.ages,
    status: 'NEW' as Status,
    source: o.source ?? 'WEB',
    prepaid: 0,
    adminNote: null,
    passed: null,
    timeSpentMin: null,
    pointsAwarded: false,
    createdAt: nowIso(),
  }
  let second: Booking | null = null
  if (slots![1]) {
    second = { ...base, id: uid(), startAt: slots![1].start, endAt: slots![1].end, basePrice: 0, discountPercent: 0, discountAmount: 0, promoCode: null, finalPrice: 0, comment: 'Второй сеанс двойной аренды', isDoubleSession: true, linkedBookingId: null }
    c.db.bookings.push(second)
  }
  const main: Booking = {
    ...base,
    id: uid(),
    startAt: slots![0].start,
    endAt: slots![0].end,
    basePrice: price.basePrice,
    discountPercent: price.discountPercent,
    discountAmount: price.basePrice - finalPrice,
    promoCode: price.promo?.code ?? null,
    finalPrice,
    comment: fullComment,
    isDoubleSession: !!second,
    linkedBookingId: second?.id ?? null,
  }
  c.db.bookings.push(main)
  if (price.promo) {
    const p = c.db.promos.find((x) => x.code === price.promo!.code)
    if (p && p.usesLeft !== null) p.usesLeft--
  }
  c.db.holds = c.db.holds.filter((h) => h.userId !== user.id)
  return main
}

function setStatus(c: Ctx, id: string, status: Status, extra: { passed?: boolean | null; timeSpentMin?: number | null } = {}) {
  const b = c.db.bookings.find((x) => x.id === id) ?? notFound('Запись не найдена')
  b.status = status
  if (extra.passed !== undefined) b.passed = extra.passed
  if (extra.timeSpentMin !== undefined) b.timeSpentMin = extra.timeSpentMin
  const second = b.linkedBookingId ? c.db.bookings.find((x) => x.id === b.linkedBookingId) : null
  if (second) second.status = status
  if (status === 'COMPLETED' && !b.pointsAwarded) {
    const u = c.db.users.find((x) => x.id === b.userId)!
    const quest = c.db.quests.find((x) => x.id === b.questId)!
    const pts = c.db.settings.loyalty.pointsPerVisit
    u.points += pts
    u.lastVisitAt = ms(b.startAt) > Date.now() ? nowIso() : b.startAt
    c.db.points.unshift({ id: uid(), userId: u.id, delta: pts, reason: 'VISIT', comment: `Квест «${quest.title}»`, bookingId: b.id, createdAt: nowIso() })
    b.pointsAwarded = true
  }
  return b
}

function createPayment(c: Ctx, user: User, purpose: Payment['purpose'], entityId: string, amount: number, back: string) {
  const p: Payment = { id: uid(), userId: user.id, purpose, entityId, amount, status: 'PENDING', provider: 'mock', createdAt: nowIso(), paidAt: null }
  c.db.payments.unshift(p)
  return { paymentId: p.id, confirmationUrl: `/payment/mock?id=${p.id}&back=${encodeURIComponent(back)}` }
}

/* ------------------------------------------------------------------ маршруты */

type Handler = (c: Ctx) => unknown | Promise<unknown>
const routes: { method: string; parts: string[]; handler: Handler }[] = []
const route = (method: string, pattern: string, handler: Handler) => routes.push({ method, parts: pattern.split('/').filter(Boolean), handler })

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const int = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Math.round(Number(v)) : fallback)
const getQuest = (c: Ctx, id: string) => c.db.quests.find((q) => q.id === id) ?? notFound('Квест не найден')
const activeQuest = (c: Ctx, id: unknown) => {
  const q = c.db.quests.find((x) => x.id === id && x.isActive)
  return q ?? notFound('Квест не найден')
}

/* ---- публичные ---- */

route('GET', '/content', ({ db }) => {
  const s = db.settings
  return {
    site: s.site,
    contacts: s.contacts,
    booking: { prepayMode: s.booking.prepayMode, prepayPercent: s.booking.prepayPercent, prepayAmount: s.booking.prepayAmount, basePlayers: s.booking.basePlayers, extraPlayerPrice: s.booking.extraPlayerPrice, cancelHours: s.booking.cancelHours, holdMinutes: s.booking.holdMinutes },
    extras: s.extras,
    loyalty: s.loyalty,
    recordings: { price: s.recordings.price, linkDays: s.recordings.linkDays },
  }
})

route('GET', '/quests', ({ db }) => db.quests.filter((q) => q.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map(publicQuest))

route('GET', '/quests/:slug', ({ db, params }) => {
  const q = db.quests.find((x) => (x.slug === params.slug || x.id === params.slug) && x.isActive)
  return publicQuest(q ?? notFound('Квест не найден'))
})

route('GET', '/quests/:id/calendar', ({ db, params, query, user }) => {
  const [y, m] = str(query.month).split('-').map(Number)
  if (!y || !m) fail(400, 'Некорректный месяц', 'VALIDATION')
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const today = venueDateKey(new Date())
  const horizon = shiftKey(today, db.settings.booking.horizonDays)
  return Array.from({ length: days }, (_, i) => {
    const key = `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    if (key < today || key > horizon) return { date: key, free: 0, total: 0 }
    const slots = getSlots(db, params.id, key, { userId: user?.id })
    return { date: key, free: slots.filter((s) => s.available).length, total: slots.length }
  })
})

route('GET', '/quests/:id/slots', ({ db, params, query, user }) => getSlots(db, params.id, str(query.date), { userId: user?.id }))

/* ---- вход ---- */

route('POST', '/auth/code', ({ db, body }) => {
  const phone = phoneOrFail(body.phone)
  if (body.website) return { ok: true, resendIn: 60 }
  const existing = db.users.find((u) => u.phone === phone)
  if (existing?.blocked) fail(403, 'Аккаунт заблокирован. Свяжитесь с администратором.', 'BLOCKED')
  if (!existing && !body.consent) fail(400, 'Необходимо согласие на обработку персональных данных', 'CONSENT_REQUIRED')
  return { ok: true, isNewUser: !existing, hasPassword: !!existing?.password, ...issueCode(db, phone, 'auth') }
})

route('POST', '/auth/verify', ({ db, body }) => {
  const phone = phoneOrFail(body.phone)
  consumeCode(db, phone, body.code, 'auth')
  let u = db.users.find((x) => x.phone === phone)
  if (!u) {
    u = {
      id: uid(),
      phone,
      phoneVerified: true,
      name: null,
      birthDate: null,
      email: null,
      password: null,
      points: 0,
      lastVisitAt: null,
      roleId: null,
      blocked: false,
      messenger: (['TELEGRAM', 'VK', 'MAX'].includes(str(body.channel)) ? body.channel : 'TELEGRAM') as Messenger,
      telegramChatId: null,
      vkUserId: null,
      maxUserId: null,
      notifyBookings: true,
      notifyReminders: true,
      notifyPromo: false,
      createdAt: nowIso(),
    }
    db.users.push(u)
  }
  u.phoneVerified = true
  if (u.blocked) fail(403, 'Аккаунт заблокирован', 'BLOCKED')
  return session(db, u)
})

route('POST', '/auth/password', ({ db, body }) => {
  const phone = normalizePhone(body.phone)
  const u = db.users.find((x) => x.phone === phone)
  if (!u || !u.password || u.password !== body.password) fail(401, 'Неверный телефон или пароль', 'BAD_CREDENTIALS')
  if (u!.blocked) fail(403, 'Аккаунт заблокирован', 'BLOCKED')
  return session(db, u!)
})

route('POST', '/auth/refresh', ({ db }) => {
  const u = db.users.find((x) => x.id === db.sessionUserId)
  if (!u || u.blocked) fail(401, 'Сессия истекла', 'NO_REFRESH')
  return session(db, u!)
})

route('POST', '/auth/logout', ({ db }) => {
  db.sessionUserId = null
  return { ok: true }
})

/* ---- профиль ---- */

route('GET', '/profile', (c) => serializeUser(c.db, requireUser(c)))

route('PATCH', '/profile', (c) => {
  const u = requireUser(c)
  const b = c.body
  if (b.name !== undefined) {
    const name = str(b.name).trim()
    if (name.length < 2) fail(400, 'Имя слишком короткое', 'VALIDATION')
    u.name = name.slice(0, 60)
  }
  if (b.birthDate !== undefined) u.birthDate = b.birthDate ? new Date(str(b.birthDate)).toISOString() : null
  if (b.email !== undefined) {
    const email = str(b.email).trim()
    if (email && !/^\S+@\S+\.\S+$/.test(email)) fail(400, 'Некорректный e-mail', 'VALIDATION')
    u.email = email || null
  }
  if (b.messenger !== undefined) u.messenger = b.messenger as Messenger
  if (b.vkUserId) u.vkUserId = str(b.vkUserId)
  if (b.maxUserId) u.maxUserId = str(b.maxUserId)
  const n = b.notify as Partial<Record<'bookings' | 'reminders' | 'promo', boolean>> | undefined
  if (n) {
    if (n.bookings !== undefined) u.notifyBookings = n.bookings
    if (n.reminders !== undefined) u.notifyReminders = n.reminders
    if (n.promo !== undefined) u.notifyPromo = n.promo
  }
  return serializeUser(c.db, u)
})

route('POST', '/profile/password', (c) => {
  const u = requireUser(c)
  const password = str(c.body.password)
  if (password.length < 8) fail(400, 'Минимум 8 символов', 'VALIDATION')
  u.password = password
  return { ok: true }
})

route('POST', '/profile/phone/code', (c) => {
  const u = requireUser(c)
  const phone = phoneOrFail(c.body.phone)
  if (c.db.users.some((x) => x.phone === phone)) fail(400, 'Этот номер уже занят', 'PHONE_TAKEN')
  return { ok: true, ...issueCode(c.db, phone, `change:${u.id}`) }
})

route('POST', '/profile/phone/verify', (c) => {
  const u = requireUser(c)
  const phone = phoneOrFail(c.body.phone)
  consumeCode(c.db, phone, c.body.code, `change:${u.id}`)
  u.phone = phone
  u.phoneVerified = true
  return serializeUser(c.db, u)
})

route('GET', '/profile/link/telegram', () =>
  demoOnly('В демо-версии привязка недоступна. На рабочем сайте откроется Telegram-бот, и уведомления начнут приходить туда.'),
)

route('GET', '/profile/loyalty', (c) => {
  const u = requireUser(c)
  const loyalty = c.db.settings.loyalty
  const log = c.db.points.filter((p) => p.userId === u.id).sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
  const lastBurn = log.find((p) => p.reason === 'BURN')
  const tier = tierFor(u.points, loyalty)
  const burnAt = u.points > 0 ? nextBurnDate(u.lastVisitAt, lastBurn?.createdAt ?? null, loyalty) : null
  return {
    points: u.points,
    percent: tier.percent,
    nextTier: tier.next,
    tiers: loyalty.tiers,
    pointsPerVisit: loyalty.pointsPerVisit,
    burn: {
      afterMonths: loyalty.burnAfterMonths,
      percentPerMonth: loyalty.burnPercentPerMonth,
      nextAt: burnAt?.toISOString() ?? null,
      amount: burnAt ? Math.ceil((u.points * loyalty.burnPercentPerMonth) / 100) : 0,
      warning: !!burnAt && burnAt.getTime() - Date.now() < 30 * DAY,
    },
    lastVisitAt: u.lastVisitAt,
    log,
  }
})

route('GET', '/profile/recordings', (c) => {
  const u = requireUser(c)
  return c.db.bookings
    .filter((b) => b.userId === u.id && b.status === 'COMPLETED' && !isSecond(c.db, b))
    .sort((a, b) => ms(b.startAt) - ms(a.startAt))
    .map((b) => {
      const q = c.db.quests.find((x) => x.id === b.questId)!
      const ids = [b.id, b.linkedBookingId].filter(Boolean)
      return {
        bookingId: b.id,
        quest: { title: q.title, photoUrl: q.photoUrl, slug: q.slug },
        startAt: b.startAt,
        recordings: c.db.recordings
          .filter((r) => ids.includes(r.bookingId))
          .map((r) => ({
            id: r.id,
            durationSec: r.durationSec,
            sizeBytes: r.sizeBytes,
            price: r.price || c.db.settings.recordings.price,
            isPurchased: r.isPurchased,
            expiresAt: r.expiresAt,
            downloadable: r.isPurchased && !!r.expiresAt && ms(r.expiresAt) > Date.now(),
            available: !r.deleteAfter || ms(r.deleteAfter) > Date.now(),
          })),
      }
    })
})

/* ---- запись ---- */

route('POST', '/bookings/hold', (c) => {
  const u = requireUser(c)
  activeQuest(c, c.body.questId)
  c.db.holds = c.db.holds.filter((h) => h.userId !== u.id)
  const slots = resolveSlots(c.db, str(c.body.questId), str(c.body.startAt), !!c.body.double, { userId: u.id })
  if (!slots) fail(409, 'Этот сеанс уже заняли — выберите другое время', 'SLOT_TAKEN')
  const expiresAt = new Date(Date.now() + c.db.settings.booking.holdMinutes * 60_000).toISOString()
  c.db.holds.push({ id: uid(), questId: str(c.body.questId), userId: u.id, startAt: slots![0].start, endAt: slots![slots!.length - 1].end, expiresAt })
  return { expiresAt, slots }
})

route('DELETE', '/bookings/hold', (c) => {
  const u = requireUser(c)
  c.db.holds = c.db.holds.filter((h) => h.userId !== u.id)
  return { ok: true }
})

route('POST', '/bookings/quote', (c) => {
  const u = requireUser(c)
  activeQuest(c, c.body.questId)
  const slots = resolveSlots(c.db, str(c.body.questId), str(c.body.startAt), !!c.body.double, { userId: u.id })
  if (!slots) fail(409, 'Этот сеанс уже заняли — выберите другое время', 'SLOT_TAKEN')
  return quote(c.db, slots!.map((s) => s.price), u, c.body.promoCode, { players: int(c.body.playersCount), double: !!c.body.double, extras: c.body.extras })
})

route('POST', '/bookings', (c) => {
  const u = requireUser(c)
  const quest = activeQuest(c, c.body.questId)
  const ages = Array.isArray(c.body.ages) ? (c.body.ages as unknown[]).map(Number).filter((n) => n > 0) : []
  const booking = createBooking(c, u, quest, {
    startAt: str(c.body.startAt),
    players: int(c.body.playersCount),
    ages,
    double: !!c.body.double,
    comment: str(c.body.comment).slice(0, 1000),
    promoCode: c.body.promoCode,
    extras: c.body.extras,
  })
  // Предоплата вносится переводом (не онлайн) — бронь оформляется сразу, без редиректа на оплату
  return { booking: bookingView(c.db, booking), payment: null }
})

route('GET', '/bookings/my', (c) => {
  const u = requireUser(c)
  const cancelHours = c.db.settings.booking.cancelHours
  const mine = c.db.bookings
    .filter((b) => b.userId === u.id && !isSecond(c.db, b))
    .sort((a, b) => ms(b.startAt) - ms(a.startAt))
    .map((b) => bookingView(c.db, b))
  const now = Date.now()
  const active = mine
    .filter((b) => ACTIVE.includes(b.status) && ms(b.linkedBooking?.endAt ?? b.endAt) > now)
    .reverse()
    .map((b) => ({ ...b, canChange: ms(b.startAt) - now >= cancelHours * 3_600_000, isLive: ms(b.startAt) <= now && ms(b.linkedBooking?.endAt ?? b.endAt) > now }))
  return { active, history: mine.filter((b) => !active.some((a) => a.id === b.id)), cancelHours }
})

function ownChangeable(c: Ctx, id: string) {
  const u = requireUser(c)
  const b = c.db.bookings.find((x) => x.id === id && x.userId === u.id) ?? notFound('Запись не найдена')
  if (!ACTIVE.includes(b.status)) fail(400, 'Эту запись уже нельзя изменить')
  const hours = c.db.settings.booking.cancelHours
  if (ms(b.startAt) - Date.now() < hours * 3_600_000) {
    fail(400, `Отменить или перенести запись можно не позднее чем за ${hours} ч до начала. Позвоните администратору.`, 'TOO_LATE')
  }
  return b
}

route('POST', '/bookings/:id/cancel', (c) => setStatus(c, ownChangeable(c, c.params.id).id, 'CANCELLED'))

route('POST', '/bookings/:id/reschedule', (c) => {
  const b = ownChangeable(c, c.params.id)
  const slots = resolveSlots(c.db, b.questId, str(c.body.startAt), !!b.linkedBookingId, { userId: b.userId, exclude: [b.id, b.linkedBookingId ?? ''] })
  if (!slots) fail(409, 'Это время недоступно', 'SLOT_TAKEN')
  b.startAt = slots![0].start
  b.endAt = slots![0].end
  b.status = 'NEW'
  const second = b.linkedBookingId ? c.db.bookings.find((x) => x.id === b.linkedBookingId) : null
  if (second && slots![1]) {
    second.startAt = slots![1].start
    second.endAt = slots![1].end
    second.status = 'NEW'
  }
  c.db.holds = c.db.holds.filter((h) => h.userId !== b.userId)
  return bookingView(c.db, b)
})

/* ---- видео, оплата, трансляции ---- */

function ownRecording(c: Ctx, id: string) {
  const u = requireUser(c)
  const r = c.db.recordings.find((x) => x.id === id) ?? notFound('Запись не найдена')
  const b = c.db.bookings.find((x) => x.id === r.bookingId)
  if (!b || b.userId !== u.id) forbidden()
  return { u, r, b: b! }
}

route('POST', '/recordings/:id/purchase', (c) => {
  const { u, r } = ownRecording(c, c.params.id)
  if (r.isPurchased) fail(400, 'Запись уже куплена')
  return createPayment(c, u, 'RECORDING', r.id, r.price || c.db.settings.recordings.price, '/profile/videos')
})

route('GET', '/recordings/:id/download', (c) => {
  const { r } = ownRecording(c, c.params.id)
  if (!r.isPurchased) fail(402, 'Запись не оплачена', 'NOT_PAID')
  return demoOnly('Это демо: видеофайла здесь нет. На рабочем сайте начнётся скачивание по временной ссылке.')
})

route('GET', '/payments/:id', (c) => {
  const u = requireUser(c)
  const p = c.db.payments.find((x) => x.id === c.params.id) ?? notFound()
  if (p.userId !== u.id) forbidden()
  return p
})

route('POST', '/payments/:id/mock-confirm', (c) => {
  const u = requireUser(c)
  const p = c.db.payments.find((x) => x.id === c.params.id) ?? notFound()
  if (p.userId !== u.id) forbidden()
  if (p.status !== 'SUCCEEDED') {
    p.status = 'SUCCEEDED'
    p.paidAt = nowIso()
    if (p.purpose === 'RECORDING') {
      const r = c.db.recordings.find((x) => x.id === p.entityId)
      if (r) {
        r.isPurchased = true
        r.purchasedAt = nowIso()
        r.expiresAt = new Date(Date.now() + c.db.settings.recordings.linkDays * DAY).toISOString()
      }
    } else {
      const b = c.db.bookings.find((x) => x.id === p.entityId)
      if (b) {
        b.prepaid += p.amount
        b.status = 'CONFIRMED'
      }
    }
  }
  return p
})

function describeStream(db: DB, b: Booking) {
  const q = db.quests.find((x) => x.id === b.questId)!
  const second = b.linkedBookingId ? db.bookings.find((x) => x.id === b.linkedBookingId) : null
  const end = second?.endAt ?? b.endAt
  const now = Date.now()
  const live = ACTIVE.includes(b.status) && ms(b.startAt) <= now && ms(end) > now
  return {
    bookingId: b.id,
    quest: { title: q.title, roomNumber: q.roomNumber, photoUrl: q.photoUrl },
    startAt: b.startAt,
    endAt: end,
    status: live ? 'live' : now < ms(b.startAt) ? 'upcoming' : 'ended',
    hlsUrl: live ? `demo://room${q.roomNumber}` : null,
    token: live ? 'demo' : null,
  }
}

route('GET', '/streams/booking/:id', (c) => {
  const u = requireUser(c)
  const b = c.db.bookings.find((x) => x.id === c.params.id) ?? notFound()
  if (b.userId !== u.id) forbidden()
  return describeStream(c.db, b)
})

route('POST', '/streams/booking/:id/invite', (c) => {
  const u = requireUser(c)
  const b = c.db.bookings.find((x) => x.id === c.params.id) ?? notFound()
  if (b.userId !== u.id) forbidden()
  const info = describeStream(c.db, b)
  if (info.status === 'ended' || !ACTIVE.includes(b.status)) fail(400, 'Сеанс уже завершён')
  const token = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8)
  c.db.invites.push({ token, bookingId: b.id, expiresAt: info.endAt })
  return { url: `${DEMO_SITE}/watch/${token}`, expiresAt: info.endAt, path: `/watch/${token}` }
})

route('GET', '/streams/invite/:token', (c) => {
  const inv = c.db.invites.find((x) => x.token === c.params.token)
  if (!inv || ms(inv.expiresAt) < Date.now()) notFound('Ссылка недействительна или трансляция завершена')
  const b = c.db.bookings.find((x) => x.id === inv!.bookingId) ?? notFound()
  return describeStream(c.db, b)
})

/* ---- админка: заявки ---- */

const dayStart = (key: string) => atVenue(key, '00:00').getTime()

route('GET', '/admin/dashboard', (c) => {
  requirePerm(c, 'dashboard.view')
  const now = Date.now()
  const today = venueDateKey(new Date())
  const from = dayStart(today)
  const to = dayStart(shiftKey(today, 1))
  const mains = c.db.bookings.filter((b) => !isSecond(c.db, b))
  const todayList = mains.filter((b) => ms(b.startAt) >= from && ms(b.startAt) < to && b.status !== 'CANCELLED').sort((a, b) => ms(a.startAt) - ms(b.startAt))
  const next = mains.filter((b) => ACTIVE.includes(b.status) && ms(b.startAt) > now).sort((a, b) => ms(a.startAt) - ms(b.startAt))[0]
  return {
    next: next ? bookingView(c.db, next, true) : null,
    today: todayList.map((b) => bookingView(c.db, b, true)),
    newCount: mains.filter((b) => b.status === 'NEW' && ms(b.startAt) > now).length,
    live: c.db.bookings.filter((b) => ACTIVE.includes(b.status) && ms(b.startAt) <= now && ms(b.endAt) > now).map((b) => bookingView(c.db, b, true)),
    todayRevenue: todayList.filter((b) => b.status !== 'NO_SHOW').reduce((s, b) => s + b.finalPrice, 0),
  }
})

route('GET', '/admin/bookings', (c) => {
  requirePerm(c, 'bookings.view')
  const q = c.query
  const statuses = str(q.status).split(',').filter(Boolean)
  const page = Math.max(1, int(q.page, 1))
  const pageSize = Math.min(200, Math.max(1, int(q.pageSize, 30)))
  const search = str(q.q).trim().toLowerCase()
  const digits = search.replace(/\D/g, '')
  let items = c.db.bookings.filter((b) => !isSecond(c.db, b))
  if (statuses.length) items = items.filter((b) => statuses.includes(b.status))
  if (q.questId) items = items.filter((b) => b.questId === q.questId)
  if (q.from) items = items.filter((b) => ms(b.startAt) >= dayStart(str(q.from)))
  if (q.to) items = items.filter((b) => ms(b.startAt) < dayStart(shiftKey(str(q.to), 1)))
  if (search) {
    items = items.filter((b) => {
      const u = c.db.users.find((x) => x.id === b.userId)!
      return (u.name ?? '').toLowerCase().includes(search) || (digits.length >= 3 && u.phone.includes(digits.length >= 10 ? digits.slice(-10) : digits))
    })
  }
  items.sort((a, b) => (q.sort === 'asc' ? ms(a.startAt) - ms(b.startAt) : ms(b.startAt) - ms(a.startAt)))
  return { items: items.slice((page - 1) * pageSize, page * pageSize).map((b) => bookingView(c.db, b, true)), total: items.length, page, pageSize }
})

route('GET', '/admin/bookings/calendar', (c) => {
  requirePerm(c, 'bookings.view')
  const from = dayStart(str(c.query.from))
  const to = dayStart(shiftKey(str(c.query.to), 1))
  return c.db.bookings
    .filter((b) => ['NEW', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'].includes(b.status) && ms(b.startAt) >= from && ms(b.startAt) < to)
    .sort((a, b) => ms(a.startAt) - ms(b.startAt))
    .map((b) => bookingView(c.db, b, true))
})

route('GET', '/admin/bookings/:id', (c) => {
  requirePerm(c, 'bookings.view')
  const b = c.db.bookings.find((x) => x.id === c.params.id) ?? notFound()
  return { ...bookingView(c.db, b, true), recordings: c.db.recordings.filter((r) => r.bookingId === b.id) }
})

route('POST', '/admin/bookings', (c) => {
  requirePerm(c, 'bookings.edit')
  const phone = phoneOrFail(c.body.phone)
  const quest = getQuest(c, str(c.body.questId))
  let u = c.db.users.find((x) => x.phone === phone)
  if (!u) {
    u = { ...c.db.users[0], id: uid(), phone, name: str(c.body.name) || null, password: null, roleId: null, points: 0, lastVisitAt: null, email: null, birthDate: null, createdAt: nowIso(), blocked: false }
    c.db.users.push(u)
    adminLog(c, 'user.create', 'User', u.id, { phone, name: u.name })
  }
  const ages = Array.isArray(c.body.ages) ? (c.body.ages as unknown[]).map(Number).filter((n) => n > 0) : []
  const b = createBooking(c, u, quest, {
    startAt: str(c.body.startAt),
    players: int(c.body.playersCount),
    ages,
    double: !!c.body.double,
    comment: str(c.body.comment) || null,
    source: (c.body.source as Booking['source']) ?? 'PHONE',
    ignoreLead: true,
    finalPrice: c.body.finalPrice === undefined ? undefined : int(c.body.finalPrice),
  })
  if (c.body.confirm !== false) setStatus(c, b.id, 'CONFIRMED')
  adminLog(c, 'booking.create', 'Booking', b.id, c.body)
  return b
})

route('PATCH', '/admin/bookings/:id', (c) => {
  requirePerm(c, 'bookings.edit')
  const b = c.db.bookings.find((x) => x.id === c.params.id) ?? notFound()
  const before = clone(b)
  const body = c.body
  const quest = getQuest(c, str(body.questId) || b.questId)
  const startAt = body.startAt ? new Date(str(body.startAt)).toISOString() : b.startAt
  const endAt = new Date(ms(startAt) + quest.durationMin * 60_000).toISOString()
  if ((body.startAt || body.questId) && !body.force) {
    const clash = c.db.bookings.find(
      (x) => x.id !== b.id && x.id !== b.linkedBookingId && x.questId === quest.id && ACTIVE.includes(x.status) && overlaps(ms(x.startAt), ms(x.endAt), ms(startAt), ms(endAt)),
    )
    if (clash) {
      const cu = c.db.users.find((x) => x.id === clash.userId)
      fail(409, 'На это время уже есть запись', 'SLOT_TAKEN', { clash: { id: clash.id, startAt: clash.startAt, name: cu?.name ?? null } })
    }
  }
  const shift = ms(startAt) - ms(b.startAt)
  const second = b.linkedBookingId ? c.db.bookings.find((x) => x.id === b.linkedBookingId) : null
  if (second && (body.startAt || body.questId)) {
    second.questId = quest.id
    second.startAt = new Date(ms(second.startAt) + shift).toISOString()
    second.endAt = new Date(ms(second.startAt) + quest.durationMin * 60_000).toISOString()
  }
  const base = body.basePrice !== undefined ? int(body.basePrice) : b.basePrice
  const percent = body.discountPercent !== undefined ? int(body.discountPercent) : b.discountPercent
  const finalPrice =
    body.finalPrice !== undefined ? int(body.finalPrice) : body.basePrice !== undefined || body.discountPercent !== undefined ? Math.round(base * (1 - percent / 100)) : b.finalPrice
  Object.assign(b, {
    questId: quest.id,
    startAt,
    endAt,
    playersCount: body.playersCount !== undefined ? int(body.playersCount) : b.playersCount,
    ages: Array.isArray(body.ages) ? (body.ages as unknown[]).map(Number).filter((n) => n > 0) : b.ages,
    basePrice: base,
    discountPercent: percent,
    discountAmount: base - finalPrice,
    finalPrice,
    comment: body.comment !== undefined ? (body.comment as string | null) : b.comment,
    adminNote: body.adminNote !== undefined ? (body.adminNote as string | null) : b.adminNote,
  })
  adminLog(c, 'booking.update', 'Booking', b.id, { before, changes: body })
  return bookingView(c.db, b, true)
})

route('POST', '/admin/bookings/:id/status', (c) => {
  requirePerm(c, 'bookings.edit')
  const status = str(c.body.status) as Status
  if (!['NEW', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(status)) fail(400, 'Некорректный статус', 'VALIDATION')
  const b = setStatus(c, c.params.id, status, {
    passed: c.body.passed as boolean | null | undefined,
    timeSpentMin: c.body.timeSpentMin as number | null | undefined,
  })
  adminLog(c, 'booking.status', 'Booking', b.id, c.body)
  return b
})

/* ---- админка: пользователи и роли ---- */

function adminUserRow(c: Ctx, u: User, showRoles: boolean) {
  const r = roleOf(c.db, u)
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    phoneVerified: u.phoneVerified,
    email: u.email,
    points: u.points,
    blocked: u.blocked,
    createdAt: u.createdAt,
    lastVisitAt: u.lastVisitAt,
    bookingsCount: c.db.bookings.filter((b) => b.userId === u.id).length,
    noShows: c.db.bookings.filter((b) => b.userId === u.id && b.status === 'NO_SHOW').length,
    role: showRoles && r ? { key: r.key, name: r.name } : undefined,
  }
}

route('GET', '/admin/users', (c) => {
  const me = requirePerm(c, 'users.view')
  const showRoles = can(c.db, me, 'roles.manage')
  const search = str(c.query.q).trim().toLowerCase()
  const digits = search.replace(/\D/g, '')
  let items = [...c.db.users].sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
  if (search) {
    items = items.filter(
      (u) =>
        (u.name ?? '').toLowerCase().includes(search) ||
        (u.email ?? '').toLowerCase().includes(search) ||
        (digits.length >= 3 && u.phone.includes(digits.length >= 10 ? digits.slice(-10) : digits)),
    )
  }
  if (c.query.blocked) items = items.filter((u) => u.blocked === (c.query.blocked === 'true'))
  const page = Math.max(1, int(c.query.page, 1))
  return { total: items.length, page, pageSize: 30, items: items.slice((page - 1) * 30, page * 30).map((u) => adminUserRow(c, u, showRoles)) }
})

route('GET', '/admin/users/:id', (c) => {
  const me = requirePerm(c, 'users.view')
  const u = c.db.users.find((x) => x.id === c.params.id) ?? notFound()
  const showRoles = can(c.db, me, 'roles.manage')
  return {
    ...adminUserRow(c, u, showRoles),
    birthDate: u.birthDate,
    bookings: c.db.bookings
      .filter((b) => b.userId === u.id)
      .sort((a, b) => ms(b.startAt) - ms(a.startAt))
      .map((b) => ({ id: b.id, startAt: b.startAt, status: b.status, finalPrice: b.finalPrice, quest: { title: c.db.quests.find((q) => q.id === b.questId)?.title } })),
    pointsLog: c.db.points.filter((p) => p.userId === u.id).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)),
  }
})

route('POST', '/admin/users', (c) => {
  requirePerm(c, 'users.edit')
  const phone = phoneOrFail(c.body.phone)
  if (c.db.users.some((u) => u.phone === phone)) fail(400, 'Пользователь с таким номером уже есть')
  const name = str(c.body.name).trim()
  if (!name) fail(400, 'Укажите имя', 'VALIDATION')
  const u: User = { ...c.db.users[0], id: uid(), phone, name, email: str(c.body.email) || null, password: null, roleId: null, points: 0, lastVisitAt: null, birthDate: null, blocked: false, createdAt: nowIso() }
  c.db.users.push(u)
  adminLog(c, 'user.create', 'User', u.id, c.body)
  return u
})

route('POST', '/admin/users/:id/verify-phone', (c) => {
  requirePerm(c, 'users.edit')
  const u = c.db.users.find((x) => x.id === c.params.id) ?? notFound()
  u.phoneVerified = true
  adminLog(c, 'user.verifyPhone', 'User', u.id)
  return { ok: true }
})

route('POST', '/admin/users/:id/block', (c) => {
  const me = requirePerm(c, 'users.edit')
  if (c.params.id === me.id) fail(400, 'Нельзя заблокировать себя')
  const u = c.db.users.find((x) => x.id === c.params.id) ?? notFound()
  u.blocked = !!c.body.blocked
  adminLog(c, u.blocked ? 'user.block' : 'user.unblock', 'User', u.id, { reason: c.body.reason })
  return { ok: true }
})

route('POST', '/admin/users/:id/points', (c) => {
  requirePerm(c, 'points.edit')
  const u = c.db.users.find((x) => x.id === c.params.id) ?? notFound()
  const comment = str(c.body.comment).trim()
  if (comment.length < 2) fail(400, 'Укажите причину', 'VALIDATION')
  const real = Math.max(int(c.body.delta), -u.points)
  u.points += real
  c.db.points.unshift({ id: uid(), userId: u.id, delta: real, reason: 'ADMIN', comment, bookingId: null, createdAt: nowIso() })
  adminLog(c, 'user.points', 'User', u.id, { delta: real, comment })
  return { ok: true, points: u.points }
})

route('PUT', '/admin/users/:id/role', (c) => {
  requirePerm(c, 'roles.manage')
  const u = c.db.users.find((x) => x.id === c.params.id) ?? notFound()
  const key = c.body.roleKey ? str(c.body.roleKey) : null
  const role = key ? c.db.roles.find((r) => r.key === key) ?? fail(400, 'Роль не найдена') : null
  const current = roleOf(c.db, u)
  if (current?.key === 'owner' && key !== 'owner' && c.db.users.filter((x) => roleOf(c.db, x)?.key === 'owner').length <= 1) {
    fail(400, 'Нельзя снять последнего главного администратора')
  }
  u.roleId = role?.id ?? null
  adminLog(c, 'user.role', 'User', u.id, { from: current?.key ?? null, to: key })
  return { ok: true }
})

route('GET', '/admin/roles', (c) => {
  requirePerm(c, 'roles.manage')
  return {
    roles: c.db.roles.map((r) => ({ ...r, users: c.db.users.filter((u) => u.roleId === r.id).map((u) => ({ id: u.id, name: u.name, phone: u.phone })) })),
    permissions: PERM_LABELS,
  }
})

route('PUT', '/admin/roles/:key', (c) => {
  requirePerm(c, 'roles.manage')
  if (c.params.key === 'owner') forbidden('Права главного администратора не редактируются')
  const role = c.db.roles.find((r) => r.key === c.params.key) ?? notFound()
  role.permissions = (Array.isArray(c.body.permissions) ? (c.body.permissions as string[]) : []).filter((p) => PERMS.includes(p) && p !== 'roles.manage')
  adminLog(c, 'role.update', 'Role', role.id, { permissions: role.permissions })
  return role
})

route('GET', '/admin/logs', (c) => {
  requirePerm(c, 'logs.view')
  const page = Math.max(1, int(c.query.page, 1))
  const items = c.db.logs.slice((page - 1) * 50, page * 50).map((l) => {
    const a = c.db.users.find((u) => u.id === l.adminId)
    return { ...l, admin: { name: a?.name ?? null, phone: a?.phone ?? '' } }
  })
  return { items, total: c.db.logs.length, page, pageSize: 50 }
})

/* ---- админка: квесты, загрузки, настройки, промокоды ---- */

route('GET', '/admin/quests', (c) => {
  requirePerm(c, 'dashboard.view')
  return [...c.db.quests].sort((a, b) => a.sortOrder - b.sortOrder)
})

function questFromBody(c: Ctx, existing?: Quest): Quest {
  const b = c.body
  const slug = str(b.slug).trim()
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) fail(400, 'Адрес страницы: только латиница, цифры и дефис', 'VALIDATION')
  if (c.db.quests.some((q) => q.slug === slug && q.id !== existing?.id)) fail(400, 'Такой адрес страницы уже занят', 'VALIDATION')
  if (str(b.title).trim().length < 2) fail(400, 'Укажите название', 'VALIDATION')
  if (int(b.minPlayers) > int(b.maxPlayers)) fail(400, 'Минимум игроков больше максимума')
  const schedules = (Array.isArray(b.schedules) ? (b.schedules as Schedule[]) : []).map((s) => ({ id: uid(), weekday: int(s.weekday), timeFrom: s.timeFrom, timeTo: s.timeTo, breakMin: int(s.breakMin) }))
  return {
    id: existing?.id ?? uid(),
    slug,
    title: str(b.title).trim(),
    shortDescription: str(b.shortDescription).trim(),
    description: str(b.description).trim(),
    photoUrl: str(b.photoUrl) || existing?.photoUrl || '/images/abyss.webp',
    fearLevel: Math.min(5, Math.max(1, int(b.fearLevel, 3))),
    minPlayers: int(b.minPlayers, 2),
    maxPlayers: int(b.maxPlayers, 5),
    durationMin: int(b.durationMin, 60),
    minAge: int(b.minAge, 14),
    basePrice: int(b.basePrice),
    peakExtra: int(b.peakExtra),
    roomNumber: int(b.roomNumber, 1),
    isActive: !!b.isActive,
    sortOrder: int(b.sortOrder),
    tags: Array.isArray(b.tags) ? (b.tags as string[]).slice(0, 8) : [],
    schedules,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  }
}

route('POST', '/admin/quests', (c) => {
  requirePerm(c, 'quests.edit')
  const q = questFromBody(c)
  c.db.quests.push(q)
  adminLog(c, 'quest.create', 'Quest', q.id, { title: q.title })
  return q
})

route('PUT', '/admin/quests/:id', (c) => {
  requirePerm(c, 'quests.edit')
  const idx = c.db.quests.findIndex((q) => q.id === c.params.id)
  if (idx === -1) notFound()
  const q = questFromBody(c, c.db.quests[idx])
  c.db.quests[idx] = q
  adminLog(c, 'quest.update', 'Quest', q.id, { title: q.title })
  return q
})

route('DELETE', '/admin/quests/:id', (c) => {
  requirePerm(c, 'quests.edit')
  const q = getQuest(c, c.params.id)
  if (c.db.bookings.some((b) => b.questId === q.id)) {
    q.isActive = false
    adminLog(c, 'quest.hide', 'Quest', q.id)
    return { ok: true, hidden: true }
  }
  c.db.quests = c.db.quests.filter((x) => x.id !== q.id)
  adminLog(c, 'quest.delete', 'Quest', q.id)
  return { ok: true }
})

const readAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

route('POST', '/admin/uploads', async (c) => {
  requirePerm(c, 'quests.edit')
  const file = c.body.file
  if (!(file instanceof Blob) || !/^image\/(jpeg|png|webp|avif)$/.test(file.type)) fail(400, 'Нужен файл изображения (jpg, png, webp, avif)')
  if ((file as Blob).size > 3 * 1024 * 1024) fail(400, 'В демо-версии — изображения до 3 МБ')
  adminLog(c, 'upload', 'File', (file as File).name ?? null)
  return { url: await readAsDataUrl(file as Blob) }
})

route('GET', '/admin/settings', (c) => {
  requirePerm(c, 'dashboard.view')
  return c.db.settings
})

route('PUT', '/admin/settings/:key', (c) => {
  const key = c.params.key as keyof Settings
  if (!(key in c.db.settings)) notFound()
  requirePerm(c, key === 'site' || key === 'contacts' ? 'content.edit' : 'settings.edit')
  ;(c.db.settings as Record<string, unknown>)[key] = { ...c.db.settings[key], ...c.body }
  adminLog(c, 'settings.update', 'Setting', key, c.body)
  return c.db.settings[key]
})

route('GET', '/admin/promocodes', (c) => {
  requirePerm(c, 'promo.edit')
  return c.db.promos
})

route('POST', '/admin/promocodes', (c) => {
  requirePerm(c, 'promo.edit')
  const b = c.body
  if (!b.discountPercent && !b.discountAmount) fail(400, 'Укажите процент или сумму', 'VALIDATION')
  const code = (str(b.code).trim() || (b.isCertificate ? 'GIFT-' : 'PROMO-') + Math.random().toString(36).slice(2, 7)).toUpperCase()
  if (c.db.promos.some((p) => p.code === code)) fail(400, 'Такой код уже существует')
  const promo: Promo = {
    id: uid(),
    code,
    isCertificate: !!b.isCertificate,
    discountPercent: (b.discountPercent as number | null) ?? null,
    discountAmount: (b.discountAmount as number | null) ?? null,
    validTo: b.validTo ? new Date(str(b.validTo)).toISOString() : null,
    usesLeft: b.isCertificate ? 1 : ((b.usesLeft as number | null) ?? null),
    isActive: true,
    createdAt: nowIso(),
  }
  c.db.promos.unshift(promo)
  adminLog(c, 'promo.create', 'PromoCode', promo.id, b)
  return promo
})

route('PATCH', '/admin/promocodes/:id', (c) => {
  requirePerm(c, 'promo.edit')
  const p = c.db.promos.find((x) => x.id === c.params.id) ?? notFound()
  p.isActive = !!c.body.isActive
  adminLog(c, 'promo.update', 'PromoCode', p.id, c.body)
  return p
})

/* ---- админка: видео и платежи ---- */

route('GET', '/admin/recordings', (c) => {
  requirePerm(c, 'recordings.manage')
  const items = c.db.recordings
    .filter((r) => (c.query.unbound ? !r.bookingId : true))
    .sort((a, b) => ms(b.recordedAt) - ms(a.recordedAt))
    .map((r) => {
      const b = r.bookingId ? c.db.bookings.find((x) => x.id === r.bookingId) : null
      const u = b ? c.db.users.find((x) => x.id === b.userId) : null
      return { ...r, booking: b ? { ...bookingView(c.db, b), user: { name: u?.name ?? null, phone: u?.phone ?? '' } } : null }
    })
  return { items, retentionDays: c.db.settings.recordings.retentionDays }
})

route('POST', '/admin/recordings', (c) => {
  requirePerm(c, 'recordings.manage')
  const file = c.body.file
  if (!(file instanceof Blob)) fail(400, 'Прикрепите видеофайл')
  const room = int(c.body.room, 1)
  const recordedAt = new Date(str(c.body.recordedAt)).toISOString()
  const durationSec = int(c.body.durationSec, 3600)
  let bookingId = str(c.body.bookingId) || null
  if (!bookingId) {
    const end = ms(recordedAt) + durationSec * 1000
    const match = c.db.bookings.find((b) => {
      const q = c.db.quests.find((x) => x.id === b.questId)
      return q?.roomNumber === room && ['NEW', 'CONFIRMED', 'COMPLETED'].includes(b.status) && overlaps(ms(b.startAt), ms(b.endAt), ms(recordedAt), end)
    })
    bookingId = match?.id ?? null
  }
  const r: Recording = {
    id: uid(),
    bookingId,
    roomNumber: room,
    fileKey: `recordings/room${room}/${recordedAt}.mp4`,
    durationSec,
    sizeBytes: (file as Blob).size,
    recordedAt,
    price: c.db.settings.recordings.price,
    isPurchased: false,
    purchasedAt: null,
    expiresAt: null,
    deleteAfter: new Date(ms(recordedAt) + c.db.settings.recordings.retentionDays * DAY).toISOString(),
    createdAt: nowIso(),
  }
  c.db.recordings.unshift(r)
  adminLog(c, 'recording.upload', 'Recording', r.id, { room, bookingId })
  return r
})

route('PATCH', '/admin/recordings/:id', (c) => {
  requirePerm(c, 'recordings.manage')
  const r = c.db.recordings.find((x) => x.id === c.params.id) ?? notFound()
  if ('bookingId' in c.body) {
    const id = c.body.bookingId ? str(c.body.bookingId) : null
    if (id && !c.db.bookings.some((b) => b.id === id)) notFound('Заявка не найдена')
    r.bookingId = id
  }
  adminLog(c, 'recording.update', 'Recording', r.id, c.body)
  return r
})

route('GET', '/admin/recordings/:id/download', (c) => {
  requirePerm(c, 'recordings.manage')
  return demoOnly('Это демо: видеофайлов здесь нет. На рабочем сайте файл скачивается по временной ссылке из закрытого хранилища.')
})

route('DELETE', '/admin/recordings/:id', (c) => {
  requirePerm(c, 'recordings.manage')
  const r = c.db.recordings.find((x) => x.id === c.params.id) ?? notFound()
  c.db.recordings = c.db.recordings.filter((x) => x.id !== r.id)
  adminLog(c, 'recording.delete', 'Recording', r.id, { fileKey: r.fileKey })
  return { ok: true }
})

route('GET', '/admin/payments', (c) => {
  requirePerm(c, 'payments.view')
  const page = Math.max(1, int(c.query.page, 1))
  const items = c.db.payments.slice((page - 1) * 50, page * 50).map((p) => {
    const u = c.db.users.find((x) => x.id === p.userId)
    return { ...p, user: { name: u?.name ?? null, phone: u?.phone ?? '' } }
  })
  return { items, total: c.db.payments.length, page, pageSize: 50 }
})

/* ---- админка: отчёты ---- */

route('GET', '/admin/reports', (c) => {
  requirePerm(c, 'reports.view')
  const fromKey = str(c.query.from)
  const toKey = str(c.query.to)
  const from = dayStart(fromKey)
  const to = dayStart(shiftKey(toKey, 1))
  const inRange = c.db.bookings.filter((b) => ms(b.startAt) >= from && ms(b.startAt) < to)
  const main = inRange.filter((b) => !isSecond(c.db, b))
  const done = main.filter((b) => b.status === 'COMPLETED')
  const revenue = done.reduce((s, b) => s + b.finalPrice, 0)
  const upcoming = main.filter((b) => ACTIVE.includes(b.status)).length
  const paid = c.db.payments.filter((p) => p.status === 'SUCCEEDED' && p.paidAt && ms(p.paidAt) >= from && ms(p.paidAt) < to)
  const dayKeys: string[] = []
  for (let k = fromKey; k <= toKey && dayKeys.length < 400; k = shiftKey(k, 1)) dayKeys.push(k)
  const byDay = dayKeys.map((date) => {
    const dayItems = main.filter((b) => venueDateKey(b.startAt) === date)
    return { date, bookings: dayItems.length, revenue: dayItems.filter((b) => b.status === 'COMPLETED').reduce((s, b) => s + b.finalPrice, 0) }
  })
  return {
    revenue,
    recordingsRevenue: paid.filter((p) => p.purpose === 'RECORDING').reduce((s, p) => s + p.amount, 0),
    prepayments: paid.filter((p) => p.purpose === 'BOOKING_PREPAY').reduce((s, p) => s + p.amount, 0),
    bookings: main.length,
    completed: done.length,
    cancelled: main.filter((b) => b.status === 'CANCELLED').length,
    noShows: main.filter((b) => b.status === 'NO_SHOW').length,
    upcoming,
    avgCheck: done.length ? Math.round(revenue / done.length) : 0,
    conversion: main.length - upcoming ? Math.round((done.length / (main.length - upcoming)) * 100) : 0,
    bySource: [
      ['WEB', 'Сайт'],
      ['ADMIN', 'Админ'],
      ['PHONE', 'Телефон'],
      ['WALK_IN', 'Без записи'],
    ].map(([k, label]) => ({ source: label, count: main.filter((b) => b.source === k).length })),
    byQuest: c.db.quests.map((q) => {
      const totalSlots = dayKeys.reduce((s, d) => s + buildGrid(q, d).length, 0)
      const qb = inRange.filter((b) => b.questId === q.id && ['NEW', 'CONFIRMED', 'COMPLETED'].includes(b.status))
      const qDone = qb.filter((b) => b.status === 'COMPLETED')
      return {
        questId: q.id,
        title: q.title,
        sessions: qb.length,
        totalSlots,
        load: totalSlots ? Math.round((qb.length / totalSlots) * 100) : 0,
        revenue: qDone.reduce((s, b) => s + b.finalPrice, 0),
        players: qDone.filter((b) => !isSecond(c.db, b)).reduce((s, b) => s + b.playersCount, 0),
      }
    }),
    byDay,
  }
})

route('GET', '/admin/reports/export', (c) => {
  requirePerm(c, 'reports.view')
  return demoOnly('Это демо: браузерная песочница не даёт скачивать файлы. На рабочем сайте здесь выгружается таблица Excel или CSV.')
})

/* ------------------------------------------------------------------ диспетчер */

type DemoRequest = { method: string; path: string; query?: Record<string, string | number | boolean | undefined | null>; body?: unknown; token: string | null }

const delay = (n: number) => new Promise((r) => setTimeout(r, n))

export async function handleDemoRequest(req: DemoRequest): Promise<{ status: number; data: unknown }> {
  const database = load()
  // небольшая задержка — как у настоящего сервера, чтобы были видны состояния загрузки
  await delay(req.method === 'GET' ? 140 : 260)
  database.holds = database.holds.filter((h) => ms(h.expiresAt) > Date.now())

  const parts = req.path.split('?')[0].split('/').filter(Boolean)
  const query: Record<string, string> = {}
  Object.entries(req.query ?? {}).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && (query[k] = String(v)))
  let body: Record<string, unknown> = {}
  if (req.body instanceof FormData) req.body.forEach((v, k) => (body[k] = v))
  else if (req.body && typeof req.body === 'object') body = req.body as Record<string, unknown>

  const userId = req.token?.startsWith('demo.') ? req.token.slice(5) : null
  const user = database.users.find((u) => u.id === userId) ?? null

  for (const r of routes) {
    if (r.method !== req.method || r.parts.length !== parts.length) continue
    const params: Record<string, string> = {}
    const ok = r.parts.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(parts[i])), true) : p === parts[i]))
    if (!ok) continue
    try {
      const data = await r.handler({ db: database, user, body, query, params })
      if (req.method !== 'GET' || req.path === '/auth/refresh') save()
      return { status: 200, data: clone(data) }
    } catch (e) {
      if (e instanceof HttpError) {
        save()
        return { status: e.status, data: e.data }
      }
      console.error(e)
      return { status: 500, data: { error: 'Внутренняя ошибка демо-сервера' } }
    }
  }
  return { status: 404, data: { error: 'Не найдено' } }
}
