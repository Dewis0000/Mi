import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlarmClock, CalendarDays, Phone, Radio, Users } from 'lucide-react'
import { EmptyState, ErrorBox, Skeleton, buttonClass } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtDateTime, fmtTime, formatPhone, plural, rub } from '../../lib/format'
import { useSecondsLeft } from '../../lib/hooks'
import type { Booking } from '../../lib/types'
import { PageHeader, StatusPill } from './shared'

type Dash = { next: Booking | null; today: Booking[]; newCount: number; live: Booking[]; todayRevenue: number }

function NextBooking({ b }: { b: Booking }) {
  const left = useSecondsLeft(new Date(b.startAt).getTime())
  const h = Math.floor(left / 3600)
  const m = Math.floor((left % 3600) / 60)
  return (
    <div className="card relative overflow-hidden p-6">
      <div className="absolute -right-16 -top-16 size-56 rounded-full bg-accent/10 blur-3xl" />
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
        <AlarmClock className="size-4" /> Ближайшая запись
      </p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl uppercase">{b.quest.title}</h2>
          <p className="mt-1 text-lg">{fmtDateTime(b.startAt)}</p>
          <p className="text-sm text-muted">
            через {h > 0 && `${h} ч `}
            {m} мин
          </p>
        </div>
        <StatusPill status={b.status} />
      </div>
      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-xs text-muted">Игроков</dt>
          <dd className="flex items-center gap-2 font-semibold"><Users className="size-4 text-muted" />{b.playersCount}{b.isDoubleSession && ' · 2 сеанса'}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-xs text-muted">Контакт</dt>
          <dd className="truncate font-semibold">{b.user?.name ?? '—'}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-xs text-muted">Телефон</dt>
          <dd>
            <a href={`tel:${b.user?.phone}`} className="flex items-center gap-2 font-semibold hover:text-accent">
              <Phone className="size-4 text-muted" /> {b.user && formatPhone(b.user.phone)}
            </a>
          </dd>
        </div>
      </dl>
      {b.comment && <p className="mt-4 rounded-xl border border-line p-3 text-sm text-muted">💬 {b.comment}</p>}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: () => api<Dash>('/admin/dashboard'), refetchInterval: 30_000 })
  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
  if (error || !data) return <ErrorBox error={error} onRetry={refetch} />

  return (
    <div className="space-y-6">
      <PageHeader title="Дашборд" text={new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}>
        <Link to="/admin/bookings?new=1" className={buttonClass('primary', 'sm')}>Новая запись</Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Записей сегодня" value={data.today.length} hint={`${data.today.reduce((s, b) => s + b.playersCount, 0)} игроков`} />
        <Stat label="Ожидают подтверждения" value={data.newCount} hint={data.newCount ? <Link to="/admin/bookings?status=NEW" className="text-accent underline">Открыть заявки</Link> : 'Всё подтверждено'} />
        <Stat label="Выручка за сегодня (план)" value={rub(data.todayRevenue)} hint="По записям без отмен и неявок" />
      </div>

      {data.live.length > 0 && (
        <div className="card border-accent/40 p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-accent"><Radio className="size-4 animate-pulse" /> Идёт сейчас</p>
          <ul className="space-y-2 text-sm">
            {data.live.map((b) => (
              <li key={b.id} className="flex flex-wrap justify-between gap-2">
                <span><b>{b.quest.title}</b> · {b.user?.name} · {b.playersCount} игр.</span>
                <span className="text-muted">до {fmtTime(b.endAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.next ? <NextBooking b={data.next} /> : <EmptyState icon={<CalendarDays className="size-7" />} title="Будущих записей нет" text="Как только кто-то запишется, запись появится здесь." />}

      <div className="card">
        <h2 className="border-b border-line p-4 font-display uppercase">Расписание на сегодня</h2>
        {data.today.length === 0 ? (
          <p className="p-6 text-sm text-muted">Сегодня записей нет.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.today.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-4 p-4 text-sm">
                <span className="w-14 font-display text-xl">{fmtTime(b.startAt)}</span>
                <span className="min-w-0 flex-1">
                  <b>{b.quest.title}</b>
                  <span className="block text-muted">
                    {b.user?.name ?? 'Без имени'} · {b.user && formatPhone(b.user.phone)} · {b.playersCount} {plural(b.playersCount, ['игрок', 'игрока', 'игроков'])}
                  </span>
                </span>
                <span className="font-medium">{rub(b.finalPrice)}</span>
                <StatusPill status={b.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
