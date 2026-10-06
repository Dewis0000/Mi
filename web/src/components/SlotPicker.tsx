import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { api } from '../lib/api'
import { fmtDate, fmtTime, rub } from '../lib/format'
import type { Slot } from '../lib/types'
import { Calendar, type DayInfo } from './Calendar'
import { Skeleton } from './ui'

/** Выбор даты в календаре и свободного сеанса (с учётом двойной аренды) */
export function SlotPicker({
  questId,
  double,
  value,
  onSelect,
  initialDate,
}: {
  questId: string
  double: boolean
  value: string | null
  onSelect: (slot: Slot, next?: Slot) => void
  initialDate?: string | null
}) {
  const now = new Date()
  const [month, setMonth] = useState(() => (initialDate ? new Date(`${initialDate}T12:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1)))
  const [date, setDate] = useState<string | null>(initialDate ?? null)
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`

  const calendar = useQuery({
    queryKey: ['calendar', questId, monthKey],
    queryFn: () => api<DayInfo[]>(`/quests/${questId}/calendar`, { query: { month: monthKey } }),
  })
  const slots = useQuery({
    queryKey: ['slots', questId, date],
    queryFn: () => api<Slot[]>(`/quests/${questId}/slots`, { query: { date: date! } }),
    enabled: !!date,
    refetchInterval: 30_000,
  })

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <Calendar
        month={month}
        onMonth={setMonth}
        days={calendar.data}
        loading={calendar.isLoading}
        value={date}
        onChange={setDate}
        minMonth={now}
        maxMonth={new Date(now.getFullYear(), now.getMonth() + 2, 1)}
      />
      <div>
        <h3 className="mb-4 font-display text-lg uppercase tracking-wide">
          {date ? fmtDate(date, { day: 'numeric', month: 'long', weekday: 'long' }) : 'Выберите дату'}
        </h3>
        {!date && <p className="text-sm text-muted">Свободные сеансы появятся здесь. Сеансы идут с перерывом на подготовку комнаты.</p>}
        {date && slots.isLoading && (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        )}
        {date && slots.data && (
          <>
            {double && <p className="mb-3 text-xs text-muted">Двойная аренда: доступны сеансы, после которых свободен следующий.</p>}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
              {slots.data.map((s, i) => {
                const ok = double ? s.doubleAvailable : s.available
                const selected = value === s.start
                const next = slots.data[i + 1]
                return (
                  <button
                    type="button"
                    key={s.start}
                    disabled={!ok}
                    onClick={() => onSelect(s, double ? next : undefined)}
                    aria-pressed={selected}
                    className={clsx(
                      'rounded-xl border px-2 py-2.5 text-center transition-all',
                      selected && 'border-accent bg-accent text-accent-fg',
                      !selected && ok && 'border-line hover:border-accent',
                      !ok && 'cursor-not-allowed border-transparent bg-surface-2/50 text-muted/40',
                      !s.available && 'line-through',
                    )}
                  >
                    <div className="font-display text-lg leading-tight">
                      {fmtTime(s.start)}
                      {double && ok && next && <span className="text-xs"> +{fmtTime(next.start)}</span>}
                    </div>
                    <div className={clsx('text-xs', selected ? 'text-accent-fg/85' : 'text-muted')}>
                      {ok ? rub(double && next ? s.price + next.price : s.price) : s.available ? 'нет 2-го сеанса' : 'занято'}
                    </div>
                  </button>
                )
              })}
            </div>
            {slots.data.length === 0 && <p className="text-sm text-muted">В этот день квест не работает.</p>}
          </>
        )}
      </div>
    </div>
  )
}
