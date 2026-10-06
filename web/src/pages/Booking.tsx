import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Hourglass, Minus, Plus, Users } from 'lucide-react'
import { FearMeter } from '../components/FearMeter'
import { SlotPicker } from '../components/SlotPicker'
import { Button, ErrorBox, Field, Skeleton, buttonClass, useUi } from '../components/ui'
import { api, errorMessage, goToPayment } from '../lib/api'
import { fmtDateTime, fmtTime, plural, rub } from '../lib/format'
import { useContent, useSecondsLeft, useSeo } from '../lib/hooks'
import type { Booking as BookingT, Quest, Quote, Slot } from '../lib/types'
import { useRequireAuth } from '../lib/useRequireAuth'

const STEPS = ['Игроки', 'Дата и время', 'Подтверждение']

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-10 flex items-center gap-2 sm:gap-4">
      {STEPS.map((s, i) => (
        <li key={s} className="flex flex-1 items-center gap-2 sm:gap-3" aria-current={i === step ? 'step' : undefined}>
          <span
            className={clsx(
              'grid size-8 shrink-0 place-items-center rounded-full font-display text-sm transition-colors',
              i < step && 'bg-accent text-accent-fg',
              i === step && 'bg-accent text-accent-fg ring-4 ring-accent/25',
              i > step && 'bg-surface-2 text-muted',
            )}
          >
            {i < step ? <Check className="size-4" /> : i + 1}
          </span>
          <span className={clsx('hidden text-sm font-medium sm:block', i > step && 'text-muted')}>{s}</span>
          {i < STEPS.length - 1 && <span className={clsx('h-px flex-1', i < step ? 'bg-accent' : 'bg-line')} />}
        </li>
      ))}
    </ol>
  )
}

function Counter({ value, onChange, min = 1, max = 30 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="grid size-12 place-items-center rounded-xl border border-line hover:border-accent" aria-label="Меньше">
        <Minus className="size-5" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        className="input w-20 text-center font-display text-2xl"
        value={value || ''}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
        aria-label="Количество игроков"
      />
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="grid size-12 place-items-center rounded-xl border border-line hover:border-accent" aria-label="Больше">
        <Plus className="size-5" />
      </button>
    </div>
  )
}

export default function Booking() {
  const { slug } = useParams()
  const { user } = useRequireAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { toast } = useUi()
  const { data: content } = useContent()

  const quest = useQuery({ queryKey: ['quest', slug], queryFn: () => api<Quest>(`/quests/${slug}`) })
  useSeo(quest.data ? `Запись на «${quest.data.title}» — Neru-Квест` : 'Запись — Neru-Квест')

  const [step, setStep] = useState(0)
  const [players, setPlayers] = useState(0)
  const [ageMode, setAgeMode] = useState<'range' | 'each'>('range')
  const [ageRange, setAgeRange] = useState({ min: '', max: '' })
  const [ages, setAges] = useState<string[]>([])
  const [double, setDouble] = useState(false)
  const [slot, setSlot] = useState<{ first: Slot; second?: Slot } | null>(null)
  const [holdUntil, setHoldUntil] = useState(0)
  const [promo, setPromo] = useState('')
  const [appliedPromo, setAppliedPromo] = useState<string | undefined>()
  const [comment, setComment] = useState('')
  const [extras, setExtras] = useState<Record<string, number>>({})
  const [done, setDone] = useState<BookingT | null>(null)
  const holdLeft = useSecondsLeft(holdUntil)

  const q = quest.data
  useEffect(() => {
    if (q && !players) setPlayers(q.minPlayers)
  }, [q, players])
  useEffect(() => setAges((a) => Array.from({ length: players }, (_, i) => a[i] ?? '')), [players])

  // снимаем блокировку слота при уходе со страницы (если она была и ещё действует)
  const holdRef = useRef(0)
  useEffect(() => {
    holdRef.current = holdUntil
  }, [holdUntil])
  useEffect(
    () => () => {
      if (holdRef.current > Date.now()) void api('/bookings/hold', { method: 'DELETE' }).catch(() => null)
    },
    [],
  )

  const ageList = useMemo(
    () => (ageMode === 'range' ? [ageRange.min, ageRange.max] : ages).map(Number).filter((n) => n > 0),
    [ageMode, ageRange, ages],
  )

  const extrasList = content?.extras ?? []
  const extrasPayload = useMemo(
    () => Object.entries(extras).filter(([, n]) => n > 0).map(([id, qty]) => ({ id, qty })),
    [extras],
  )
  // комната отдыха выбрана? (опция с оплатой за час) — от неё зависит доступность декора
  const roomSelected = extrasList.some((ex) => ex.unit === 'hour' && (extras[ex.id] ?? 0) > 0)
  // при снятии комнаты убираем выбранный декор
  useEffect(() => {
    if (roomSelected) return
    setExtras((s) => {
      let changed = false
      const next = { ...s }
      for (const ex of extrasList) if (ex.requiresRoom && next[ex.id]) { next[ex.id] = 0; changed = true }
      return changed ? next : s
    })
  }, [roomSelected, extrasList])

  // проверка шага 1
  const playersIssue = useMemo(() => {
    if (!q) return null
    if (players < q.minPlayers) return { kind: 'error', text: `Минимум ${q.minPlayers} ${plural(q.minPlayers, ['игрок', 'игрока', 'игроков'])}` } as const
    if (players > q.maxPlayers * 2) return { kind: 'error', text: `Даже на два сеанса подряд — не больше ${q.maxPlayers * 2} игроков` } as const
    if (players > q.maxPlayers) return { kind: 'double' } as const
    return null
  }, [q, players])

  const ageIssue = useMemo(() => {
    if (!q) return null
    const expected = ageMode === 'range' ? 2 : players
    if (ageList.length < expected) return 'Укажите возраст ' + (ageMode === 'range' ? 'самого младшего и самого старшего игрока' : 'каждого игрока')
    if (ageMode === 'range' && Number(ageRange.min) > Number(ageRange.max)) return 'Минимальный возраст больше максимального'
    if (Math.min(...ageList) < q.minAge) return `Квест доступен с ${q.minAge} лет — в команде есть игрок младше`
    return null
  }, [q, ageList, ageMode, players, ageRange])

  useEffect(() => {
    if (playersIssue?.kind !== 'double') setDouble(false)
  }, [playersIssue])

  const step1Valid = q && !ageIssue && (!playersIssue || (playersIssue.kind === 'double' && double))

  const hold = useMutation({
    mutationFn: (s: Slot) => api<{ expiresAt: string }>('/bookings/hold', { method: 'POST', body: { questId: q!.id, startAt: s.start, double } }),
    onSuccess: (r) => setHoldUntil(new Date(r.expiresAt).getTime()),
    onError: (e) => {
      toast(errorMessage(e), 'error')
      setSlot(null)
      qc.invalidateQueries({ queryKey: ['slots', q?.id] })
    },
  })

  const quote = useQuery({
    queryKey: ['quote', q?.id, slot?.first.start, double, appliedPromo, players, extrasPayload],
    queryFn: () => api<Quote>('/bookings/quote', { method: 'POST', body: { questId: q!.id, startAt: slot!.first.start, double, promoCode: appliedPromo, playersCount: players, extras: extrasPayload } }),
    enabled: step === 2 && !!slot,
    retry: false,
  })

  const create = useMutation({
    mutationFn: () =>
      api<{ booking: BookingT; payment: { confirmationUrl: string } | null }>('/bookings', {
        method: 'POST',
        body: { questId: q!.id, startAt: slot!.first.start, double, playersCount: players, ages: ageList, comment: comment || undefined, promoCode: appliedPromo, extras: extrasPayload },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] })
      if (r.payment) {
        goToPayment(r.payment.confirmationUrl, navigate)
        return
      }
      holdRef.current = 0
      setDone(r.booking)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  // блокировка истекла — возвращаем к выбору времени
  useEffect(() => {
    if (step === 2 && holdUntil && holdLeft === 0 && !done && !create.isPending) {
      toast('Время на оформление истекло — выберите сеанс заново', 'info')
      setSlot(null)
      setHoldUntil(0)
      setStep(1)
    }
  }, [holdLeft, holdUntil, step, done, create.isPending, toast])

  if (quest.isError) return <div className="mx-auto max-w-3xl px-4 py-20"><ErrorBox error={quest.error} onRetry={() => quest.refetch()} /></div>
  if (!q || !user) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-16">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.4 }} className="mx-auto mb-6 grid size-20 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
          <CheckCircle2 className="size-10" />
        </motion.div>
        <h1 className="font-display text-4xl uppercase">Вы записаны</h1>
        <p className="mt-4 text-muted">
          «{q.title}», {fmtDateTime(done.startAt)}. Детали отправили в {user.messenger === 'TELEGRAM' ? 'Telegram' : user.messenger === 'VK' ? 'ВКонтакте' : 'MAX'}, напомним за сутки и за 2 часа до начала.
        </p>
        <p className="mt-2 text-sm text-muted">Статус: ожидает подтверждения администратором.</p>
        {content && content.booking.prepayMode === 'prepay' && content.booking.prepayAmount > 0 && content.contacts.phone && (
          <p className="mx-auto mt-5 max-w-md rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
            Для записи внесите предоплату <b>{rub(content.booking.prepayAmount)}</b> переводом на <b>{content.contacts.phone}</b>. После перевода пришлите чек администратору.
          </p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/profile/bookings" className={buttonClass('primary')}>
            Мои записи
          </Link>
          <Link to="/" className={buttonClass('outline')}>
            На главную
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <button onClick={() => (step ? setStep(step - 1) : navigate(-1))} className="mb-6 flex items-center gap-2 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Назад
      </button>

      <div className="mb-8 flex items-center gap-4">
        <img src={q.photoUrl} alt="" className="size-16 rounded-xl object-cover sm:size-20" />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.25em] text-accent">Запись на квест</p>
          <h1 className="truncate font-display text-3xl uppercase sm:text-4xl">{q.title}</h1>
        </div>
        <FearMeter level={q.fearLevel} className="hidden w-48 md:block" />
      </div>

      <Stepper step={step} />

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.section key="s0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div className="card space-y-8 p-6 sm:p-8">
              <div>
                <h2 className="mb-1 font-display text-xl uppercase">Сколько вас?</h2>
                <p className="mb-4 text-sm text-muted">
                  В квест помещается от {q.minPlayers} до {q.maxPlayers} игроков.
                </p>
                <Counter value={players} onChange={setPlayers} max={50} />
                {playersIssue?.kind === 'error' && <p className="mt-3 text-sm text-rose-500" role="alert">{playersIssue.text}</p>}
              </div>

              <AnimatePresence>
                {playersIssue?.kind === 'double' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className={clsx('rounded-2xl border p-5', double ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-amber-500/50 bg-amber-500/5')}>
                      <div className="flex gap-3">
                        <Users className={clsx('mt-0.5 size-5 shrink-0', double ? 'text-emerald-500' : 'text-amber-500')} />
                        <div className="flex-1">
                          <h3 className="font-semibold">Вас больше, чем вмещает квест</h3>
                          <p className="mt-1 text-sm text-muted">
                            Предлагаем аренду <b className="text-fg">двух сеансов подряд</b>: первая группа проходит квест, сразу после неё начинается второй сеанс для остальных.
                            Мы забронируем два соседних слота, цена пересчитается.
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {double ? (
                              <>
                                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-500">
                                  <Check className="size-4" /> Два сеанса подряд
                                </span>
                                <button className="text-sm text-muted underline hover:text-fg" onClick={() => setDouble(false)}>
                                  отменить
                                </button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" onClick={() => setDouble(true)}>
                                  Арендовать два сеанса
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setPlayers(q.maxPlayers)}>
                                  Уменьшить до {q.maxPlayers}
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <h2 className="mb-1 font-display text-xl uppercase">Возраст игроков</h2>
                <p className="mb-4 text-sm text-muted">Квест доступен с {q.minAge} лет.</p>
                <div className="mb-4 inline-flex rounded-xl border border-line p-1 text-sm">
                  {(['range', 'each'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setAgeMode(m)} className={clsx('rounded-lg px-3 py-1.5', ageMode === m ? 'bg-surface-2 font-medium' : 'text-muted')}>
                      {m === 'range' ? 'Диапазон' : 'Каждого игрока'}
                    </button>
                  ))}
                </div>
                {ageMode === 'range' ? (
                  <div className="grid max-w-sm grid-cols-2 gap-3">
                    <Field label="Самый младший">{(id) => <input id={id} type="number" inputMode="numeric" min={1} max={99} className="input" value={ageRange.min} onChange={(e) => setAgeRange({ ...ageRange, min: e.target.value })} placeholder="лет" />}</Field>
                    <Field label="Самый старший">{(id) => <input id={id} type="number" inputMode="numeric" min={1} max={99} className="input" value={ageRange.max} onChange={(e) => setAgeRange({ ...ageRange, max: e.target.value })} placeholder="лет" />}</Field>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {ages.map((a, i) => (
                      <input
                        key={i}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={99}
                        className={clsx('input text-center', a && Number(a) < q.minAge && 'border-rose-500')}
                        placeholder={`Игрок ${i + 1}`}
                        aria-label={`Возраст игрока ${i + 1}`}
                        value={a}
                        onChange={(e) => setAges(ages.map((x, j) => (j === i ? e.target.value : x)))}
                      />
                    ))}
                  </div>
                )}
                {ageIssue && ageList.length > 0 && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-rose-500" role="alert">
                    <AlertTriangle className="size-4" /> {ageIssue}
                  </p>
                )}
              </div>
            </div>
            <aside className="card h-fit space-y-4 p-6">
              <h3 className="font-display text-lg uppercase">Важно знать</h3>
              <ul className="space-y-3 text-sm text-muted">
                <li>• Приходите за 15 минут до начала.</li>
                <li>• Игрокам до 18 лет нужно письменное согласие родителей.</li>
                <li>• Отмена и перенос — в личном кабинете не позднее чем за {content?.booking.cancelHours ?? 24} ч.</li>
                <li>• Скидка по баллам применится автоматически.</li>
              </ul>
              <Button className="w-full" size="lg" disabled={!step1Valid} onClick={() => setStep(1)}>
                Далее
              </Button>
            </aside>
          </motion.section>
        )}

        {step === 1 && (
          <motion.section key="s1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <div className="card p-6 sm:p-8">
              <SlotPicker
                questId={q.id}
                double={double}
                value={slot?.first.start ?? null}
                onSelect={(first, second) => {
                  setSlot({ first, second })
                  hold.mutate(first)
                }}
              />
            </div>
            <div className="mt-6 flex flex-col-reverse items-stretch justify-between gap-4 sm:flex-row sm:items-center">
              <p className="text-sm text-muted">
                {slot ? (
                  <>
                    Выбрано: <b className="text-fg">{fmtDateTime(slot.first.start)}</b>
                    {slot.second && <> и {fmtTime(slot.second.start)}</>}
                    {holdUntil > 0 && <> · слот закреплён за вами на {content?.booking.holdMinutes ?? 10} минут</>}
                  </>
                ) : (
                  'Выберите дату и время сеанса'
                )}
              </p>
              <Button size="lg" disabled={!slot || hold.isPending || !holdUntil} loading={hold.isPending} onClick={() => setStep(2)}>
                Далее
              </Button>
            </div>
          </motion.section>
        )}

        {step === 2 && slot && (
          <motion.section key="s2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
            <div className="card space-y-6 p-6 sm:p-8">
              <h2 className="font-display text-xl uppercase">Проверьте запись</h2>
              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  ['Квест', q.title],
                  ['Дата и время', `${fmtDateTime(slot.first.start)}${slot.second ? ` и ${fmtTime(slot.second.start)}` : ''}`],
                  ['Игроков', `${players}${double ? ' (два сеанса)' : ''}`],
                  ['Возраст', ageMode === 'range' ? `${ageRange.min}–${ageRange.max} лет` : ageList.join(', ')],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-surface-2 p-4">
                    <dt className="text-xs uppercase tracking-wider text-muted">{k}</dt>
                    <dd className="mt-1 font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <Field label="Комментарий" hint="День рождения, особые пожелания, «щадящий» режим — администратор всё учтёт">
                {(id) => <textarea id={id} rows={3} maxLength={1000} className="input resize-none" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: у Кати день рождения, нужен торт в конце 🎂" />}
              </Field>
              {extrasList.length > 0 && (
                <Field label="Дополнительно" hint="Оформление (надпись, посуда, шары) доступно только с арендой комнаты отдыха">
                  {() => (
                    <div className="space-y-2.5">
                      {extrasList.map((ex) => {
                        const qty = extras[ex.id] ?? 0
                        const on = qty > 0
                        const locked = !!ex.requiresRoom && !roomSelected
                        return (
                          <div key={ex.id} className="flex flex-wrap items-center gap-3">
                            <label className={clsx('flex items-center gap-2.5 text-sm', locked && 'opacity-50')}>
                              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={on} disabled={locked} onChange={(e) => setExtras((s) => ({ ...s, [ex.id]: e.target.checked ? 1 : 0 }))} />
                              {ex.label} — {rub(ex.price)}{ex.unit === 'hour' ? '/час' : ''}
                              {locked && <span className="text-xs text-muted">— с комнатой отдыха</span>}
                            </label>
                            {ex.unit === 'hour' && on && (
                              <span className="flex items-center gap-2 text-sm text-muted">
                                часов
                                <input type="number" min={1} max={12} className="input w-16" value={qty} onChange={(e) => setExtras((s) => ({ ...s, [ex.id]: Math.max(1, Math.min(12, Number(e.target.value) || 1)) }))} />
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Field>
              )}
              <Field label="Промокод или сертификат" error={quote.isError && appliedPromo ? errorMessage(quote.error) : null}>
                {(id) => (
                  <div className="flex gap-2">
                    <input id={id} className="input uppercase" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="STRAH10" />
                    {appliedPromo ? (
                      <Button variant="secondary" onClick={() => { setAppliedPromo(undefined); setPromo('') }}>
                        Убрать
                      </Button>
                    ) : (
                      <Button variant="secondary" disabled={!promo.trim()} onClick={() => setAppliedPromo(promo.trim())}>
                        Применить
                      </Button>
                    )}
                  </div>
                )}
              </Field>
            </div>

            <aside className="card h-fit space-y-4 p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg uppercase">Стоимость</h3>
                {holdLeft > 0 && (
                  <span className={clsx('flex items-center gap-1.5 text-xs', holdLeft < 120 ? 'text-rose-500' : 'text-muted')} aria-live="polite">
                    <Hourglass className="size-3.5" /> {Math.floor(holdLeft / 60)}:{String(holdLeft % 60).padStart(2, '0')}
                  </span>
                )}
              </div>
              {quote.isLoading && <Skeleton className="h-32" />}
              {quote.isError && !appliedPromo && <ErrorBox error={quote.error} />}
              {quote.data && (
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted">{double ? 'Игры (2 сеанса)' : 'Игра'}</dt>
                    <dd>{rub(quote.data.gamesBase)}</dd>
                  </div>
                  {quote.data.playersExtra > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted">Доплата за игроков</dt>
                      <dd>{rub(quote.data.playersExtra)}</dd>
                    </div>
                  )}
                  {quote.data.extras.map((ex, i) => (
                    <div key={i} className="flex justify-between">
                      <dt className="text-muted">{ex.label}</dt>
                      <dd>{rub(ex.price)}</dd>
                    </div>
                  ))}
                  {quote.data.loyaltyPercent > 0 && (
                    <div className="flex justify-between text-emerald-500">
                      <dt>Скидка по баллам</dt>
                      <dd>−{quote.data.loyaltyPercent}%</dd>
                    </div>
                  )}
                  {quote.data.promo && (
                    <div className="flex justify-between text-emerald-500">
                      <dt>{quote.data.promo.isCertificate ? 'Сертификат' : 'Промокод'} {quote.data.promo.code}</dt>
                      <dd>{quote.data.promo.percent ? `−${quote.data.promo.percent}%` : `−${rub(quote.data.promo.amount ?? 0)}`}</dd>
                    </div>
                  )}
                  {quote.data.discountAmount > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted">Скидка всего</dt>
                      <dd>−{rub(quote.data.discountAmount)}</dd>
                    </div>
                  )}
                  <div className="flex items-end justify-between border-t border-line pt-3">
                    <dt className="font-medium">Итого</dt>
                    <dd className="font-display text-3xl">{rub(quote.data.finalPrice)}</dd>
                  </div>
                  {quote.data.prepay > 0 && (
                    <p className="text-xs text-muted">
                      Для записи — предоплата {rub(quote.data.prepay)} переводом, остальное на месте. Реквизиты пришлём после заявки.
                    </p>
                  )}
                  {quote.data.prepay === 0 && <p className="text-xs text-muted">Оплата на месте картой или наличными.</p>}
                </dl>
              )}
              <Button className="w-full" size="lg" loading={create.isPending} disabled={!quote.data} onClick={() => create.mutate()}>
                Подтвердить запись
              </Button>
            </aside>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}
