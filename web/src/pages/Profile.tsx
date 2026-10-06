import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  CalendarDays,
  CalendarX,
  Coins,
  Copy,
  Download,
  Film,
  Flame,
  History,
  Lock,
  Radio,
  RefreshCw,
  Settings,
  Share2,
  Trophy,
  Users,
} from 'lucide-react'
import { CodeInput } from '../components/CodeInput'
import { PhoneInput } from '../components/PhoneInput'
import { SlotPicker } from '../components/SlotPicker'
import { Badge, Button, EmptyState, ErrorBox, Field, Modal, Skeleton, Switch, Tabs, buttonClass, useUi } from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  MESSENGERS,
  STATUS_COLOR,
  STATUS_LABEL,
  fmtBytes,
  fmtDate,
  fmtDateTime,
  fmtDuration,
  fmtTime,
  formatPhone,
  isPhoneComplete,
  plural,
  rub,
  venueDateKey,
} from '../lib/format'
import { useSecondsLeft, useSeo } from '../lib/hooks'
import type { Booking, Messenger, Slot, Tier, User } from '../lib/types'
import { useRequireAuth } from '../lib/useRequireAuth'

type TabId = 'bookings' | 'history' | 'points' | 'videos' | 'settings'
const TABS: { id: TabId; label: React.ReactNode }[] = [
  { id: 'bookings', label: <><CalendarDays className="size-4" />Записи</> },
  { id: 'history', label: <><History className="size-4" />История</> },
  { id: 'points', label: <><Coins className="size-4" />Баллы</> },
  { id: 'videos', label: <><Film className="size-4" />Видео</> },
  { id: 'settings', label: <><Settings className="size-4" />Настройки</> },
]

type MyBookings = { active: Booking[]; history: Booking[]; cancelHours: number }
const useMyBookings = () => useQuery({ queryKey: ['my-bookings'], queryFn: () => api<MyBookings>('/bookings/my'), refetchInterval: 60_000 })

function StatusBadge({ status }: { status: string }) {
  return <Badge className={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Badge>
}

/* ---------------- Активные записи ---------------- */

function ActiveBookings() {
  const { data, isLoading, error, refetch } = useMyBookings()
  const qc = useQueryClient()
  const { confirm, toast } = useUi()
  const [reschedule, setReschedule] = useState<Booking | null>(null)
  const [newSlot, setNewSlot] = useState<Slot | null>(null)
  const navigate = useNavigate()

  const cancel = useMutation({
    mutationFn: (id: string) => api(`/bookings/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      toast('Запись отменена')
      qc.invalidateQueries({ queryKey: ['my-bookings'] })
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const move = useMutation({
    mutationFn: () => api(`/bookings/${reschedule!.id}/reschedule`, { method: 'POST', body: { startAt: newSlot!.start } }),
    onSuccess: () => {
      toast('Запись перенесена')
      setReschedule(null)
      qc.invalidateQueries({ queryKey: ['my-bookings'] })
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  if (isLoading) return <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-56" />)}</div>
  if (error) return <ErrorBox error={error} onRetry={refetch} />
  if (!data?.active.length) {
    return (
      <EmptyState
        icon={<CalendarX className="size-7" />}
        title="У вас пока нет записей"
        text="Выберите квест и время — а мы подготовим комнату."
        action={<Link to="/#quests" className={buttonClass('primary')}>Выбрать квест</Link>}
      />
    )
  }
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {data.active.map((b) => (
          <article key={b.id} className={clsx('card overflow-hidden', b.isLive && 'border-accent shadow-[0_0_40px_-10px_var(--glow)]')}>
            <div className="flex gap-4 p-5">
              <img src={b.quest.photoUrl} alt="" className="size-20 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={b.status} />
                  {b.isLive && <Badge className="bg-accent/15 text-accent ring-accent/40"><Radio className="size-3 animate-pulse" />Идёт сейчас</Badge>}
                </div>
                <h3 className="mt-2 truncate font-display text-xl uppercase">{b.quest.title}</h3>
                <p className="text-sm">
                  {fmtDateTime(b.startAt)}
                  {b.linkedBooking && <> и {fmtTime(b.linkedBooking.startAt)}</>}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-px border-y border-line bg-line text-sm">
              <div className="bg-surface p-3">
                <dt className="text-xs text-muted">Игроков</dt>
                <dd className="flex items-center gap-1.5"><Users className="size-3.5 text-muted" />{b.playersCount}{b.isDoubleSession && ' · 2 сеанса'}</dd>
              </div>
              <div className="bg-surface p-3">
                <dt className="text-xs text-muted">Итого{b.discountPercent > 0 && ` (−${b.discountPercent}%)`}</dt>
                <dd className="font-semibold">
                  {rub(b.finalPrice)}
                  {b.discountAmount > 0 && <span className="ml-2 text-xs font-normal text-muted line-through">{rub(b.basePrice)}</span>}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2 p-4">
              {b.isLive && (
                <Button size="sm" onClick={() => navigate(`/live/${b.id}`)}>
                  <Radio className="size-4" /> Смотреть онлайн
                </Button>
              )}
              {!b.isLive && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!b.canChange}
                    onClick={() => {
                      setNewSlot(null)
                      setReschedule(b)
                    }}
                  >
                    <RefreshCw className="size-4" /> Перенести
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!b.canChange}
                    loading={cancel.isPending && cancel.variables === b.id}
                    onClick={async () => {
                      if (await confirm({ title: 'Отменить запись?', text: `«${b.quest.title}», ${fmtDateTime(b.startAt)}. Слот освободится для других игроков.`, confirmText: 'Отменить запись', danger: true })) cancel.mutate(b.id)
                    }}
                  >
                    Отменить
                  </Button>
                  <Link to={`/live/${b.id}`} className={buttonClass('ghost', 'sm')}>
                    <Share2 className="size-4" /> Трансляция
                  </Link>
                </>
              )}
            </div>
            {!b.canChange && !b.isLive && (
              <p className="px-4 pb-4 text-xs text-muted">До начала меньше {data.cancelHours} ч — отмена и перенос только по телефону администратора.</p>
            )}
          </article>
        ))}
      </div>

      <Modal open={!!reschedule} onClose={() => setReschedule(null)} title="Перенос записи" wide>
        {reschedule && (
          <>
            <p className="mb-6 text-sm text-muted">
              Сейчас: «{reschedule.quest.title}», {fmtDateTime(reschedule.startAt)}. Выберите новое время.
            </p>
            <SlotPicker questId={reschedule.questId} double={!!reschedule.linkedBooking} value={newSlot?.start ?? null} onSelect={setNewSlot} initialDate={venueDateKey(reschedule.startAt)} />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReschedule(null)}>Отмена</Button>
              <Button disabled={!newSlot} loading={move.isPending} onClick={() => move.mutate()}>
                Перенести{newSlot && ` на ${fmtDate(newSlot.start)} ${fmtTime(newSlot.start)}`}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}

/* ---------------- История ---------------- */

function HistoryTab() {
  const { data, isLoading, error, refetch } = useMyBookings()
  if (isLoading) return <Skeleton className="h-64" />
  if (error) return <ErrorBox error={error} onRetry={refetch} />
  if (!data?.history.length) return <EmptyState icon={<History className="size-7" />} title="История пуста" text="Здесь появятся пройденные квесты и ваши результаты." />
  return (
    <div className="card divide-y divide-line">
      {data.history.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap">
          <img src={b.quest.photoUrl} alt="" className="size-14 rounded-xl object-cover" loading="lazy" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg uppercase">{b.quest.title}</div>
            <div className="text-sm text-muted">{fmtDateTime(b.startAt)} · {b.playersCount} {plural(b.playersCount, ['игрок', 'игрока', 'игроков'])}</div>
          </div>
          {b.status === 'COMPLETED' && b.passed !== null ? (
            <div className="text-right">
              <div className={clsx('flex items-center justify-end gap-1.5 font-semibold', b.passed ? 'text-emerald-500' : 'text-rose-500')}>
                {b.passed ? <Trophy className="size-4" /> : null}
                {b.passed ? 'Выбрались' : 'Не выбрались'}
              </div>
              {b.timeSpentMin && <div className="text-xs text-muted">за {b.timeSpentMin} мин</div>}
            </div>
          ) : (
            <StatusBadge status={b.status} />
          )}
        </div>
      ))}
    </div>
  )
}

/* ---------------- Баллы ---------------- */

type Loyalty = {
  points: number
  percent: number
  nextTier: Tier | null
  tiers: Tier[]
  pointsPerVisit: number
  burn: { afterMonths: number; percentPerMonth: number; nextAt: string | null; amount: number; warning: boolean }
  lastVisitAt: string | null
  log: { id: string; delta: number; reason: string; comment: string | null; createdAt: string }[]
}

const REASON: Record<string, string> = { VISIT: 'Посещение', BURN: 'Сгорание', ADMIN: 'Корректировка', SPEND: 'Списание' }

function PointsTab() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['loyalty'], queryFn: () => api<Loyalty>('/profile/loyalty') })
  if (isLoading) return <Skeleton className="h-80" />
  if (error || !data) return <ErrorBox error={error} onRetry={refetch} />
  const progress = data.nextTier ? Math.min(100, Math.round((data.points / data.nextTier.from) * 100)) : 100
  return (
    <div className="space-y-6">
      {data.burn.warning && data.burn.nextAt && (
        <div className="flex gap-3 rounded-2xl border border-orange-500/40 bg-orange-500/10 p-4 text-sm" role="alert">
          <Flame className="size-5 shrink-0 text-orange-500" />
          <div>
            <b>Баллы скоро начнут сгорать.</b> {fmtDate(data.burn.nextAt, { day: 'numeric', month: 'long', year: 'numeric' })} спишется {data.burn.amount}{' '}
            {plural(data.burn.amount, ['балл', 'балла', 'баллов'])} ({data.burn.percentPerMonth}% от баланса) — вы не были у нас больше {data.burn.afterMonths} месяцев.{' '}
            <Link to="/#quests" className="font-medium text-accent underline">Записаться на квест</Link>, чтобы сохранить скидку.
          </div>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card relative overflow-hidden p-6 md:col-span-2">
          <div className="absolute -right-10 -top-10 size-48 rounded-full bg-accent/15 blur-3xl" />
          <p className="text-sm text-muted">Баланс</p>
          <p className="font-display text-6xl">{data.points}</p>
          <p className="text-sm text-muted">{plural(data.points, ['балл', 'балла', 'баллов'])}</p>
          <div className="mt-6">
            <div className="mb-2 flex justify-between text-xs text-muted">
              <span>Скидка сейчас: <b className="text-fg">{data.percent}%</b></span>
              {data.nextTier ? <span>До {data.nextTier.percent}% — ещё {data.nextTier.from - data.points}</span> : <span>Максимальный уровень</span>}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 text-sm">
            <div>
              <dt className="text-muted">Последний визит</dt>
              <dd className="font-medium">{data.lastVisitAt ? fmtDate(data.lastVisitAt, { day: 'numeric', month: 'long', year: 'numeric' }) : 'ещё не было'}</dd>
            </div>
            <div>
              <dt className="text-muted">Посещений</dt>
              <dd className="font-medium">{data.log.filter((l) => l.reason === 'VISIT').length}</dd>
            </div>
          </dl>
        </div>
        <div className="card p-6">
          <p className="mb-3 text-sm text-muted">Уровни скидки</p>
          <ul className="space-y-2 text-sm">
            {data.tiers.map((t, i) => (
              <li key={t.from} className={clsx('flex justify-between rounded-lg px-3 py-1.5', data.percent === t.percent && 'bg-accent/15 font-semibold text-accent')}>
                <span>{t.from}{data.tiers[i + 1] ? `–${data.tiers[i + 1].from - 1}` : '+'}</span>
                <span>{t.percent}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">
            +{data.pointsPerVisit} за каждое посещение. Без посещений {data.burn.afterMonths} мес. баллы сгорают по {data.burn.percentPerMonth}% в месяц.
            {data.burn.nextAt && !data.burn.warning && <> Ближайшее сгорание — {fmtDate(data.burn.nextAt, { day: 'numeric', month: 'long', year: 'numeric' })}</>}
          </p>
        </div>
      </div>
      <div className="card">
        <h3 className="border-b border-line p-4 font-display uppercase">История начислений и списаний</h3>
        {data.log.length === 0 ? (
          <p className="p-6 text-sm text-muted">Пока пусто — баллы начислятся после первой игры.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.log.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                <div>
                  <div>{REASON[l.reason] ?? l.reason}{l.comment && <span className="text-muted"> · {l.comment}</span>}</div>
                  <div className="text-xs text-muted">{fmtDate(l.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                </div>
                <span className={clsx('font-display text-lg', l.delta > 0 ? 'text-emerald-500' : 'text-rose-500')}>
                  {l.delta > 0 ? '+' : ''}
                  {l.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ---------------- Видеозаписи ---------------- */

type RecordingItem = {
  bookingId: string
  quest: { title: string; photoUrl: string; slug: string }
  startAt: string
  recordings: { id: string; durationSec: number; sizeBytes: number; price: number; isPurchased: boolean; expiresAt: string | null; downloadable: boolean; available: boolean }[]
}

function VideosTab() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['my-recordings'], queryFn: () => api<RecordingItem[]>('/profile/recordings') })
  const { toast, confirm } = useUi()
  const [busy, setBusy] = useState<string | null>(null)
  const [params] = useSearchParams()
  const qc = useQueryClient()

  useEffect(() => {
    if (params.get('payment')) {
      toast('Оплата прошла — запись доступна для скачивания')
      qc.invalidateQueries({ queryKey: ['my-recordings'] })
    }
  }, [params, toast, qc])

  async function buy(id: string, price: number, title: string) {
    if (!(await confirm({ title: 'Купить видеозапись?', text: `Запись прохождения «${title}» — ${rub(price)}. После оплаты ссылка на скачивание будет действовать ограниченное время.`, confirmText: `Оплатить ${rub(price)}` }))) return
    setBusy(id)
    try {
      const r = await api<{ confirmationUrl: string }>(`/recordings/${id}/purchase`, { method: 'POST' })
      window.location.href = r.confirmationUrl
    } catch (e) {
      toast(errorMessage(e), 'error')
      setBusy(null)
    }
  }
  async function downloadRec(id: string) {
    setBusy(id)
    try {
      const r = await api<{ url: string }>(`/recordings/${id}/download`)
      window.location.href = r.url
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  if (isLoading) return <Skeleton className="h-64" />
  if (error) return <ErrorBox error={error} onRetry={refetch} />
  if (!data?.length) return <EmptyState icon={<Film className="size-7" />} title="Записей пока нет" text="После прохождения квеста здесь появится видео с камер — его можно будет купить и скачать." />
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((item) => (
        <article key={item.bookingId} className="card overflow-hidden">
          <div className="relative h-36">
            <img src={item.quest.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-black/10" />
            <div className="absolute bottom-3 left-4 text-white">
              <div className="font-display text-xl uppercase">{item.quest.title}</div>
              <div className="text-sm text-white/75">{fmtDateTime(item.startAt)}</div>
            </div>
          </div>
          <div className="space-y-3 p-4">
            {item.recordings.length === 0 && <p className="text-sm text-muted">Запись ещё обрабатывается или недоступна.</p>}
            {item.recordings.map((r, i) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <div className="font-medium">Видео{item.recordings.length > 1 ? ` · сеанс ${i + 1}` : ''}</div>
                  <div className="text-xs text-muted">{fmtDuration(r.durationSec)} · {fmtBytes(r.sizeBytes)}</div>
                  {r.isPurchased && r.expiresAt && (
                    <div className={clsx('text-xs', r.downloadable ? 'text-muted' : 'text-rose-500')}>
                      {r.downloadable ? `Ссылка действует до ${fmtDate(r.expiresAt, { day: 'numeric', month: 'long' })}` : 'Срок действия ссылки истёк'}
                    </div>
                  )}
                </div>
                {r.downloadable ? (
                  <Button size="sm" loading={busy === r.id} onClick={() => downloadRec(r.id)}>
                    <Download className="size-4" /> Скачать
                  </Button>
                ) : !r.isPurchased && r.available ? (
                  <Button size="sm" variant="outline" loading={busy === r.id} onClick={() => buy(r.id, r.price, item.quest.title)}>
                    Купить за {rub(r.price)}
                  </Button>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted"><Lock className="size-3.5" /> Недоступно</span>
                )}
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

/* ---------------- Настройки ---------------- */

function SettingsTab() {
  const { user, setUser } = useAuth()
  const { toast } = useUi()
  const [form, setForm] = useState({
    name: user?.name ?? '',
    birthDate: user?.birthDate?.slice(0, 10) ?? '',
    email: user?.email ?? '',
    messenger: user?.messenger ?? 'TELEGRAM',
    vkUserId: '',
    maxUserId: '',
  })
  const [notify, setNotify] = useState(user?.notify ?? { bookings: true, reminders: true, promo: false })
  const [saving, setSaving] = useState(false)
  const [password, setPassword] = useState('')
  const [phoneModal, setPhoneModal] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const u = await api<User>('/profile', {
        method: 'PATCH',
        body: {
          name: form.name,
          birthDate: form.birthDate || null,
          email: form.email || null,
          messenger: form.messenger,
          ...(form.vkUserId ? { vkUserId: form.vkUserId } : {}),
          ...(form.maxUserId ? { maxUserId: form.maxUserId } : {}),
          notify,
        },
      })
      setUser(u)
      toast('Сохранено')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function linkTelegram() {
    try {
      const r = await api<{ url: string }>('/profile/link/telegram')
      window.open(r.url, '_blank', 'noopener')
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  async function savePassword() {
    try {
      await api('/profile/password', { method: 'POST', body: { password } })
      setPassword('')
      setUser({ ...user!, hasPassword: true })
      toast('Пароль сохранён')
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  if (!user) return null
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={save} className="card space-y-5 p-6">
        <h3 className="font-display text-lg uppercase">Профиль</h3>
        <Field label="Имя">{(id) => <input id={id} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Дата рождения">{(id) => <input id={id} type="date" className="input" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />}</Field>
          <Field label="E-mail">{(id) => <input id={id} type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        </div>
        <Field label="Телефон">
          {(id) => (
            <div className="flex gap-2">
              <input id={id} className="input" value={formatPhone(user.phone)} disabled />
              <Button type="button" variant="secondary" onClick={() => setPhoneModal(true)}>Изменить</Button>
            </div>
          )}
        </Field>

        <h3 className="pt-2 font-display text-lg uppercase">Мессенджеры</h3>
        <Field label="Куда присылать уведомления">
          {(id) => (
            <select id={id} className="input" value={form.messenger} onChange={(e) => setForm({ ...form, messenger: e.target.value as Messenger })}>
              {MESSENGERS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          )}
        </Field>
        <div className="space-y-3 rounded-xl bg-surface-2 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span>Telegram {user.linked.telegram ? <Badge className="ml-1 bg-emerald-500/15 text-emerald-500 ring-emerald-500/30">привязан</Badge> : <span className="text-muted">— не привязан</span>}</span>
            <Button type="button" size="sm" variant="outline" onClick={linkTelegram}>{user.linked.telegram ? 'Перепривязать' : 'Привязать'}</Button>
          </div>
          <Field label={<>ВКонтакте — ID {user.linked.vk && <Badge className="ml-1 bg-emerald-500/15 text-emerald-500 ring-emerald-500/30">привязан</Badge>}</>} hint="Числовой ID страницы. Разрешите сообщения от нашего сообщества.">
            {(id) => <input id={id} className="input" inputMode="numeric" placeholder={user.linked.vk ? 'Сохранён' : 'например, 123456789'} value={form.vkUserId} onChange={(e) => setForm({ ...form, vkUserId: e.target.value })} />}
          </Field>
          <Field label={<>MAX — ID {user.linked.max && <Badge className="ml-1 bg-emerald-500/15 text-emerald-500 ring-emerald-500/30">привязан</Badge>}</>} hint="Напишите нашему боту в MAX — он пришлёт ваш ID.">
            {(id) => <input id={id} className="input" placeholder={user.linked.max ? 'Сохранён' : 'ID в MAX'} value={form.maxUserId} onChange={(e) => setForm({ ...form, maxUserId: e.target.value })} />}
          </Field>
        </div>

        <h3 className="pt-2 font-display text-lg uppercase">Уведомления</h3>
        <div className="divide-y divide-line">
          <Switch checked={notify.bookings} onChange={(v) => setNotify({ ...notify, bookings: v })} label="Статус записей (создана, подтверждена, отменена)" />
          <Switch checked={notify.reminders} onChange={(v) => setNotify({ ...notify, reminders: v })} label="Напоминания за 24 и 2 часа" />
          <Switch checked={notify.promo} onChange={(v) => setNotify({ ...notify, promo: v })} label="Новые квесты и акции" />
        </div>
        <Button type="submit" loading={saving}>Сохранить</Button>
      </form>

      <div className="card h-fit space-y-4 p-6">
        <h3 className="font-display text-lg uppercase">Пароль</h3>
        <p className="text-sm text-muted">
          {user.hasPassword ? 'Пароль задан. Можно входить по телефону и паролю — без кода.' : 'Задайте пароль, чтобы входить без кода подтверждения.'}
        </p>
        <Field label={user.hasPassword ? 'Новый пароль' : 'Пароль'} hint="Минимум 8 символов">
          {(id) => <input id={id} type="password" autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button variant="secondary" disabled={password.length < 8} onClick={savePassword}>Сохранить пароль</Button>
      </div>

      <ChangePhoneModal open={phoneModal} onClose={() => setPhoneModal(false)} />
    </div>
  )
}

function ChangePhoneModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setUser } = useAuth()
  const { toast } = useUi()
  const [phone, setPhone] = useState('')
  const [channel, setChannel] = useState<Messenger>('TELEGRAM')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [until, setUntil] = useState(0)
  const left = useSecondsLeft(until)

  useEffect(() => {
    if (!open) {
      setSent(false)
      setCode('')
      setError(null)
    }
  }, [open])

  async function send() {
    setError(null)
    try {
      const r = await api<{ resendIn: number; devCode?: string }>('/profile/phone/code', { method: 'POST', body: { phone, channel } })
      setSent(true)
      setDevCode(r.devCode ?? null)
      setUntil(Date.now() + r.resendIn * 1000)
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  async function verify(v: string) {
    try {
      const u = await api<User>('/profile/phone/verify', { method: 'POST', body: { phone, code: v } })
      setUser(u)
      toast('Номер изменён')
      onClose()
    } catch (e) {
      setError(errorMessage(e))
      setCode('')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Смена номера">
      <div className="space-y-4">
        {!sent ? (
          <>
            <Field label="Новый номер">{(id) => <PhoneInput id={id} value={phone} onChange={setPhone} />}</Field>
            <div className="flex gap-2">
              {MESSENGERS.map((m) => (
                <button key={m.id} type="button" onClick={() => setChannel(m.id)} className={clsx('flex-1 rounded-xl border px-3 py-2 text-sm', channel === m.id ? 'border-accent text-accent' : 'border-line text-muted')}>
                  {m.label}
                </button>
              ))}
            </div>
            {error && <p className="text-sm text-rose-500">{error}</p>}
            <Button className="w-full" disabled={!isPhoneComplete(phone)} onClick={send}>Получить код</Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Введите код, отправленный для номера {phone}</p>
            <CodeInput value={code} onChange={(v) => { setCode(v); if (v.length === 6) verify(v) }} error={!!error} />
            {devCode && <p className="text-xs text-amber-500">Режим разработки: код <b>{devCode}</b></p>}
            {error && <p className="text-sm text-rose-500">{error}</p>}
            <div className="text-right text-sm">
              {left > 0 ? <span className="text-muted">Повторно через {left} с</span> : <button className="text-accent" onClick={send}>Отправить повторно</button>}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

/* ---------------- Страница ---------------- */

export default function Profile() {
  useSeo('Личный кабинет — Чёрный ход')
  const { user } = useRequireAuth()
  const { tab = 'bookings' } = useParams()
  const navigate = useNavigate()
  const current = (TABS.some((t) => t.id === tab) ? tab : 'bookings') as TabId
  const { toast } = useUi()

  if (!user) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-14">
        <Skeleton className="h-24" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="grid size-16 place-items-center rounded-2xl bg-accent font-display text-3xl text-accent-fg">{(user.name ?? '?')[0]?.toUpperCase()}</div>
          <div>
            <h1 className="font-display text-3xl uppercase sm:text-4xl">{user.name ?? 'Без имени'}</h1>
            <button
              className="flex items-center gap-1.5 text-sm text-muted hover:text-fg"
              onClick={() => {
                navigator.clipboard?.writeText(user.phone)
                toast('Номер скопирован', 'info')
              }}
            >
              {formatPhone(user.phone)} <Copy className="size-3" />
            </button>
          </div>
        </div>
        <Link to="/profile/points" className="card flex items-center gap-3 px-5 py-3 hover:border-accent">
          <Coins className="size-6 text-accent" />
          <div>
            <div className="font-display text-2xl leading-none">{user.points}</div>
            <div className="text-xs text-muted">{plural(user.points, ['балл', 'балла', 'баллов'])}</div>
          </div>
        </Link>
      </div>

      <Tabs tabs={TABS} value={current} onChange={(t) => navigate(`/profile/${t}`)} className="mb-8" />

      {current === 'bookings' && <ActiveBookings />}
      {current === 'history' && <HistoryTab />}
      {current === 'points' && <PointsTab />}
      {current === 'videos' && <VideosTab />}
      {current === 'settings' && <SettingsTab />}
    </div>
  )
}
