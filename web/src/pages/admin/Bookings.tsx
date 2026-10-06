import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus, Search } from 'lucide-react'
import { PhoneInput } from '../../components/PhoneInput'
import { SlotPicker } from '../../components/SlotPicker'
import { Button, EmptyState, ErrorBox, Field, Modal, Skeleton, Switch, useUi } from '../../components/ui'
import { ApiError, api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { STATUS_SHORT, dateKey, fmtDate, fmtDateTime, fmtTime, formatPhone, fromVenueInput, isPhoneComplete, rub, toVenueInput, venueDateKey, venueParts } from '../../lib/format'
import type { Booking, BookingStatus, Paged, Slot } from '../../lib/types'
import { DateRange, PageHeader, Pagination, SOURCE_LABEL, StatusPill, useAdminQuests } from './shared'

const STATUSES: BookingStatus[] = ['NEW', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']

/* ---------------- Карточка заявки: редактирование и статусы ---------------- */

function BookingModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { can } = useAuth()
  const { confirm, toast } = useUi()
  const qc = useQueryClient()
  const quests = useAdminQuests()
  const q = useQuery({ queryKey: ['admin', 'booking', id], queryFn: () => api<Booking>(`/admin/bookings/${id}`), enabled: !!id })
  const b = q.data
  const [form, setForm] = useState<Record<string, string>>({})
  const [result, setResult] = useState({ passed: true, time: '' })
  const editable = can('bookings.edit')

  useEffect(() => {
    if (!b) return
    setForm({
      questId: b.questId,
      startAt: toVenueInput(b.startAt),
      playersCount: String(b.playersCount),
      ages: b.ages.join(', '),
      basePrice: String(b.basePrice),
      discountPercent: String(b.discountPercent),
      finalPrice: String(b.finalPrice),
      comment: b.comment ?? '',
      adminNote: b.adminNote ?? '',
    })
    setResult({ passed: b.passed ?? true, time: b.timeSpentMin ? String(b.timeSpentMin) : '' })
  }, [b])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin'] })
  }

  const save = useMutation({
    mutationFn: (force: boolean) =>
      api(`/admin/bookings/${id}`, {
        method: 'PATCH',
        body: {
          questId: form.questId,
          startAt: fromVenueInput(form.startAt),
          playersCount: Number(form.playersCount),
          ages: form.ages.split(/[,\s]+/).map(Number).filter(Boolean),
          basePrice: Number(form.basePrice),
          discountPercent: Number(form.discountPercent),
          finalPrice: Number(form.finalPrice),
          comment: form.comment || null,
          adminNote: form.adminNote || null,
          force,
        },
      }),
    onSuccess: () => {
      toast('Заявка сохранена')
      refresh()
    },
    onError: async (e) => {
      if (e instanceof ApiError && e.code === 'SLOT_TAKEN') {
        const clash = e.data.clash as { startAt: string; name: string | null } | undefined
        if (await confirm({ title: 'Время занято', text: `На это время уже есть запись${clash ? ` (${clash.name ?? 'без имени'}, ${fmtTime(clash.startAt)})` : ''}. Сохранить всё равно?`, confirmText: 'Сохранить', danger: true })) save.mutate(true)
        return
      }
      toast(errorMessage(e), 'error')
    },
  })

  const status = useMutation({
    mutationFn: (body: { status: BookingStatus; passed?: boolean | null; timeSpentMin?: number | null }) => api(`/admin/bookings/${id}/status`, { method: 'POST', body }),
    onSuccess: (_d, v) => {
      toast(`Статус: ${STATUS_SHORT[v.status]}`)
      refresh()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  async function setStatus(s: BookingStatus) {
    const texts: Record<BookingStatus, string> = {
      NEW: 'Вернуть заявку в статус «новая»?',
      CONFIRMED: 'Подтвердить запись? Клиент получит уведомление.',
      COMPLETED: `Отметить квест завершённым? Клиенту начислятся баллы. Результат: ${result.passed ? 'выбрались' : 'не выбрались'}${result.time ? `, ${result.time} мин` : ''}.`,
      CANCELLED: 'Отменить запись? Слот освободится, клиент получит уведомление.',
      NO_SHOW: 'Отметить неявку? Это учитывается при блокировке за систематические неявки.',
    }
    if (!(await confirm({ title: STATUS_SHORT[s], text: texts[s], danger: s === 'CANCELLED' || s === 'NO_SHOW' }))) return
    status.mutate({ status: s, ...(s === 'COMPLETED' ? { passed: result.passed, timeSpentMin: result.time ? Number(result.time) : null } : {}) })
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <Modal open={!!id} onClose={onClose} title="Заявка" wide>
      {q.isLoading && <Skeleton className="h-96" />}
      {q.error && <ErrorBox error={q.error} />}
      {b && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-4 text-sm">
            <div>
              <div className="font-semibold">{b.user?.name ?? 'Без имени'} · <a className="hover:text-accent" href={`tel:${b.user?.phone}`}>{b.user && formatPhone(b.user.phone)}</a></div>
              <div className="text-muted">
                Создана {fmtDateTime(b.createdAt)} · {SOURCE_LABEL[b.source]}
                {b.promoCode && ` · промокод ${b.promoCode}`}
                {b.isDoubleSession && b.linkedBooking && ` · двойной сеанс (второй в ${fmtTime(b.linkedBooking.startAt)})`}
              </div>
            </div>
            <StatusPill status={b.status} />
          </div>

          <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
            <Field label="Квест">
              {(fid) => (
                <select id={fid} className="input" value={form.questId} onChange={set('questId')}>
                  {quests.data?.map((qq) => <option key={qq.id} value={qq.id}>{qq.title}</option>)}
                </select>
              )}
            </Field>
            <Field label="Дата и время">{(fid) => <input id={fid} type="datetime-local" className="input" value={form.startAt ?? ''} onChange={set('startAt')} />}</Field>
            <Field label="Игроков">{(fid) => <input id={fid} type="number" min={1} className="input" value={form.playersCount ?? ''} onChange={set('playersCount')} />}</Field>
            <Field label="Возраст (через запятую)">{(fid) => <input id={fid} className="input" value={form.ages ?? ''} onChange={set('ages')} />}</Field>
            <Field label="Базовая цена, ₽">{(fid) => <input id={fid} type="number" min={0} className="input" value={form.basePrice ?? ''} onChange={(e) => setForm((f) => ({ ...f, basePrice: e.target.value, finalPrice: String(Math.round(Number(e.target.value) * (1 - Number(f.discountPercent) / 100))) }))} />}</Field>
            <Field label="Скидка, %">{(fid) => <input id={fid} type="number" min={0} max={100} className="input" value={form.discountPercent ?? ''} onChange={(e) => setForm((f) => ({ ...f, discountPercent: e.target.value, finalPrice: String(Math.round(Number(f.basePrice) * (1 - Number(e.target.value) / 100))) }))} />}</Field>
            <Field label="Итого, ₽" hint="Пересчитывается от цены и скидки, можно задать вручную">{(fid) => <input id={fid} type="number" min={0} className="input" value={form.finalPrice ?? ''} onChange={set('finalPrice')} />}</Field>
            <Field label="Предоплата">{() => <div className="input bg-transparent">{rub(b.prepaid)}</div>}</Field>
            <Field label="Комментарий клиента" className="sm:col-span-2">{(fid) => <textarea id={fid} rows={2} className="input resize-none" value={form.comment ?? ''} onChange={set('comment')} />}</Field>
            <Field label="Заметка администратора" className="sm:col-span-2">{(fid) => <textarea id={fid} rows={2} className="input resize-none" value={form.adminNote ?? ''} onChange={set('adminNote')} placeholder="Видна только сотрудникам" />}</Field>
          </fieldset>

          {editable && (
            <>
              <div className="flex justify-end">
                <Button
                  loading={save.isPending}
                  onClick={async () => {
                    if (await confirm({ title: 'Сохранить изменения?', text: 'Изменения будут записаны в журнал действий.' })) save.mutate(false)
                  }}
                >
                  Сохранить изменения
                </Button>
              </div>
              <div className="space-y-3 border-t border-line pt-5">
                <h3 className="font-display uppercase">Статус</h3>
                <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line p-3">
                  <Switch checked={result.passed} onChange={(v) => setResult({ ...result, passed: v })} label="Команда выбралась" />
                  <Field label="Время прохождения, мин" className="w-48">{(fid) => <input id={fid} type="number" min={0} className="input" value={result.time} onChange={(e) => setResult({ ...result, time: e.target.value })} />}</Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  {b.status !== 'CONFIRMED' && <Button size="sm" variant="secondary" onClick={() => setStatus('CONFIRMED')}>Подтвердить</Button>}
                  {b.status !== 'COMPLETED' && <Button size="sm" variant="secondary" onClick={() => setStatus('COMPLETED')}>Завершено</Button>}
                  {b.status === 'COMPLETED' && <Button size="sm" variant="secondary" onClick={() => setStatus('COMPLETED')}>Обновить результат</Button>}
                  {b.status !== 'NO_SHOW' && <Button size="sm" variant="danger" onClick={() => setStatus('NO_SHOW')}>Неявка</Button>}
                  {b.status !== 'CANCELLED' && <Button size="sm" variant="danger" onClick={() => setStatus('CANCELLED')}>Отменить</Button>}
                  {['CANCELLED', 'NO_SHOW'].includes(b.status) && <Button size="sm" variant="ghost" onClick={() => setStatus('NEW')}>Вернуть в «новые»</Button>}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

/* ---------------- Новая запись вручную ---------------- */

function CreateBookingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const quests = useAdminQuests()
  const { toast } = useUi()
  const qc = useQueryClient()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [questId, setQuestId] = useState('')
  const [slot, setSlot] = useState<Slot | null>(null)
  const [players, setPlayers] = useState('2')
  const [ages, setAges] = useState({ min: '18', max: '30' })
  const [price, setPrice] = useState('')
  const [comment, setComment] = useState('')
  const [source, setSource] = useState<'PHONE' | 'WALK_IN' | 'ADMIN'>('PHONE')
  const [confirmNow, setConfirmNow] = useState(true)

  const quest = quests.data?.find((q) => q.id === questId)
  const double = !!quest && Number(players) > quest.maxPlayers
  useEffect(() => {
    if (!questId && quests.data?.length) setQuestId(quests.data.find((q) => q.isActive)?.id ?? quests.data[0].id)
  }, [quests.data, questId])
  useEffect(() => setSlot(null), [questId, double])

  const create = useMutation({
    mutationFn: () =>
      api('/admin/bookings', {
        method: 'POST',
        body: {
          phone,
          name: name || undefined,
          questId,
          startAt: slot!.start,
          playersCount: Number(players),
          ages: [Number(ages.min), Number(ages.max)].filter(Boolean),
          double,
          comment: comment || undefined,
          finalPrice: price ? Number(price) : undefined,
          source,
          confirm: confirmNow,
        },
      }),
    onSuccess: () => {
      toast('Запись создана')
      qc.invalidateQueries({ queryKey: ['admin'] })
      onClose()
      setSlot(null)
      setPhone('')
      setName('')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  return (
    <Modal open={open} onClose={onClose} title="Новая запись" wide>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Телефон клиента" hint="Если клиента нет в базе — он будет зарегистрирован">{(id) => <PhoneInput id={id} value={phone} onChange={setPhone} />}</Field>
          <Field label="Имя">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Квест">
            {(id) => (
              <select id={id} className="input" value={questId} onChange={(e) => setQuestId(e.target.value)}>
                {quests.data?.map((q) => <option key={q.id} value={q.id}>{q.title}{!q.isActive && ' (скрыт)'}</option>)}
              </select>
            )}
          </Field>
          <Field label="Источник">
            {(id) => (
              <select id={id} className="input" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
                <option value="PHONE">Звонок</option>
                <option value="WALK_IN">Пришли без записи</option>
                <option value="ADMIN">Другое</option>
              </select>
            )}
          </Field>
          <Field label="Игроков" hint={quest && `Квест: ${quest.minPlayers}–${quest.maxPlayers}${double ? '. Будет два сеанса подряд' : ''}`}>
            {(id) => <input id={id} type="number" min={1} className="input" value={players} onChange={(e) => setPlayers(e.target.value)} />}
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Возраст от">{(id) => <input id={id} type="number" className="input" value={ages.min} onChange={(e) => setAges({ ...ages, min: e.target.value })} />}</Field>
            <Field label="до">{(id) => <input id={id} type="number" className="input" value={ages.max} onChange={(e) => setAges({ ...ages, max: e.target.value })} />}</Field>
          </div>
        </div>
        {questId && <SlotPicker key={questId + double} questId={questId} double={double} value={slot?.start ?? null} onSelect={(s) => setSlot(s)} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Итоговая цена, ₽" hint="Пусто — рассчитать автоматически">{(id) => <input id={id} type="number" min={0} className="input" value={price} onChange={(e) => setPrice(e.target.value)} />}</Field>
          <Field label="Комментарий">{(id) => <input id={id} className="input" value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
        </div>
        <Switch checked={confirmNow} onChange={setConfirmNow} label="Сразу подтвердить запись" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button disabled={!isPhoneComplete(phone) || !slot} loading={create.isPending} onClick={() => create.mutate()}>
            Создать{slot && ` на ${fmtDate(slot.start)} ${fmtTime(slot.start)}`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ---------------- Календарь загрузки ---------------- */

const HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1]

function CalendarView({ onOpen, questId }: { onOpen: (id: string) => void; questId: string }) {
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return d
  })
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86_400_000))
  const from = dateKey(days[0])
  const to = dateKey(days[6])
  const q = useQuery({ queryKey: ['admin', 'calendar', from, to], queryFn: () => api<Booking[]>('/admin/bookings/calendar', { query: { from, to } }), placeholderData: keepPreviousData })
  const items = (q.data ?? []).filter((b) => !questId || b.questId === questId)

  // сеансы после полуночи показываем в колонке предыдущего дня (время — по часовому поясу площадки)
  const cell = (day: Date, hour: number) =>
    items.filter((b) => {
      const { hh } = venueParts(b.startAt)
      const owner = venueDateKey(hh < 5 ? new Date(new Date(b.startAt).getTime() - 86_400_000) : b.startAt)
      return owner === dateKey(day) && hh === hour
    })

  const today = venueDateKey(new Date())
  return (
    <div className={clsx('card overflow-hidden', q.isFetching && 'opacity-70')}>
      <div className="flex items-center justify-between border-b border-line p-3">
        <button className="grid size-9 place-items-center rounded-lg border border-line" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * 86_400_000))} aria-label="Предыдущая неделя"><ChevronLeft className="size-4" /></button>
        <span className="font-medium">{fmtDate(days[0])} — {fmtDate(days[6])}</span>
        <button className="grid size-9 place-items-center rounded-lg border border-line" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * 86_400_000))} aria-label="Следующая неделя"><ChevronRight className="size-4" /></button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-14" />
              {days.map((d) => (
                <th key={d.toISOString()} className={clsx('border-l border-line p-2 text-left font-medium', dateKey(d) === today && 'text-accent')}>
                  {d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((h) => (
              <tr key={h} className="border-t border-line">
                <td className="p-2 align-top text-muted">{String(h).padStart(2, '0')}:00</td>
                {days.map((d) => (
                  <td key={d.toISOString()} className="h-12 border-l border-line p-1 align-top">
                    {cell(d, h).map((b) => (
                      <button
                        key={b.id}
                        onClick={() => onOpen(b.id)}
                        className={clsx(
                          'mb-1 block w-full truncate rounded-md px-1.5 py-1 text-left',
                          b.status === 'NEW' && 'bg-amber-500/15 text-amber-600 light:text-amber-700',
                          b.status === 'CONFIRMED' && 'bg-emerald-500/15 text-emerald-500 light:text-emerald-700',
                          b.status === 'COMPLETED' && 'bg-sky-500/15 text-sky-500 light:text-sky-700',
                          b.status === 'NO_SHOW' && 'bg-rose-500/15 text-rose-500 light:text-rose-700',
                        )}
                        title={`${b.quest.title} · ${b.user?.name ?? ''} · ${b.playersCount} игр.`}
                      >
                        <b>{fmtTime(b.startAt)}</b> {b.quest.title}
                      </button>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ---------------- Страница ---------------- */

export default function Bookings() {
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const quests = useAdminQuests()
  const [view, setView] = useState<'table' | 'calendar'>('table')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [statuses, setStatuses] = useState<string[]>(() => params.get('status')?.split(',') ?? [])
  const [questId, setQuestId] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(params.get('new') === '1')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => setPage(1), [debounced, statuses, questId, range])

  const query = useMemo(
    () => ({ q: debounced, status: statuses.join(','), questId, from: range.from, to: range.to, page, sort: range.from ? 'asc' : 'desc' }),
    [debounced, statuses, questId, range, page],
  )
  const list = useQuery({
    queryKey: ['admin', 'bookings', query],
    queryFn: () => api<Paged<Booking>>('/admin/bookings', { query }),
    placeholderData: keepPreviousData,
    enabled: view === 'table',
  })

  return (
    <div>
      <PageHeader title="Заявки и записи">
        <div className="flex rounded-xl border border-line p-1">
          <button onClick={() => setView('table')} className={clsx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm', view === 'table' ? 'bg-surface-2 font-medium' : 'text-muted')}><List className="size-4" />Таблица</button>
          <button onClick={() => setView('calendar')} className={clsx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm', view === 'calendar' ? 'bg-surface-2 font-medium' : 'text-muted')}><CalendarDays className="size-4" />Календарь</button>
        </div>
        {can('bookings.edit') && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Новая запись
          </Button>
        )}
      </PageHeader>

      {/* фильтры — одной строкой над данными */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {view === 'table' && (
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input className="input h-9 py-1 pl-9" placeholder="Имя или телефон" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Поиск" />
          </div>
        )}
        <select className="input h-9 w-auto py-1" value={questId} onChange={(e) => setQuestId(e.target.value)} aria-label="Квест">
          <option value="">Все квесты</option>
          {quests.data?.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
        </select>
        {view === 'table' && <DateRange value={range} onChange={setRange} presets={false} />}
        {view === 'table' && (range.from || range.to) && <button className="text-sm text-muted underline" onClick={() => setRange({ from: '', to: '' })}>сбросить даты</button>}
      </div>
      {view === 'table' && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => {
                const next = statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s]
                setStatuses(next)
                setParams(next.length ? { status: next.join(',') } : {}, { replace: true })
              }}
              aria-pressed={statuses.includes(s)}
              className={clsx('h-8 rounded-full border px-3 text-xs', statuses.includes(s) ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-fg')}
            >
              {STATUS_SHORT[s]}
            </button>
          ))}
        </div>
      )}

      {view === 'calendar' ? (
        <CalendarView onOpen={setOpen} questId={questId} />
      ) : list.error ? (
        <ErrorBox error={list.error} onRetry={list.refetch} />
      ) : !list.data ? (
        <Skeleton className="h-96" />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={<Search className="size-7" />} title="Ничего не найдено" text="Измените фильтры или создайте запись вручную." />
      ) : (
        <div className={clsx('card overflow-hidden transition-opacity', list.isFetching && 'opacity-70')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="p-3 font-medium">Дата и время</th>
                  <th className="p-3 font-medium">Квест</th>
                  <th className="p-3 font-medium">Клиент</th>
                  <th className="p-3 text-right font-medium">Игроков</th>
                  <th className="p-3 text-right font-medium">Итого</th>
                  <th className="p-3 font-medium">Источник</th>
                  <th className="p-3 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.data.items.map((b) => (
                  <tr key={b.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setOpen(b.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(b.id)}>
                    <td className="whitespace-nowrap p-3 tabular-nums">
                      {fmtDate(b.startAt, { day: '2-digit', month: '2-digit', year: '2-digit' })} {fmtTime(b.startAt)}
                      {b.linkedBooking && <span className="text-muted"> +{fmtTime(b.linkedBooking.startAt)}</span>}
                    </td>
                    <td className="p-3">{b.quest.title}</td>
                    <td className="p-3">
                      <div>{b.user?.name ?? '—'}</div>
                      <div className="text-xs text-muted">{b.user && formatPhone(b.user.phone)}</div>
                    </td>
                    <td className="p-3 text-right tabular-nums">{b.playersCount}</td>
                    <td className="p-3 text-right tabular-nums">{rub(b.finalPrice)}</td>
                    <td className="p-3 text-muted">{SOURCE_LABEL[b.source]}</td>
                    <td className="p-3"><StatusPill status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
        </div>
      )}

      <BookingModal id={open} onClose={() => setOpen(null)} />
      <CreateBookingModal open={creating} onClose={() => { setCreating(false); setParams({}, { replace: true }) }} />
    </div>
  )
}
