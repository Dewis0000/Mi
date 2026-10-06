import { useMemo } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { dateKey, venueDateKey } from '../lib/format'

export type DayInfo = { date: string; free: number; total: number }

const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/** Календарь месяца: занятые и недоступные дни визуально отмечены */
export function Calendar({
  month,
  onMonth,
  days,
  value,
  onChange,
  loading,
  minMonth,
  maxMonth,
}: {
  month: Date
  onMonth: (d: Date) => void
  days: DayInfo[] | undefined
  value: string | null
  onChange: (date: string) => void
  loading?: boolean
  minMonth?: Date
  maxMonth?: Date
}) {
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const offset = (first.getDay() + 6) % 7
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))]
  }, [month])

  const info = useMemo(() => Object.fromEntries((days ?? []).map((d) => [d.date, d])), [days])
  const today = venueDateKey(new Date())
  const prevDisabled = minMonth && month <= new Date(minMonth.getFullYear(), minMonth.getMonth(), 1)
  const nextDisabled = maxMonth && month >= new Date(maxMonth.getFullYear(), maxMonth.getMonth(), 1)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          disabled={prevDisabled}
          className="grid size-10 place-items-center rounded-xl border border-line hover:border-accent disabled:opacity-30"
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="font-display text-lg uppercase tracking-wide" aria-live="polite">
          {month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
        </div>
        <button
          type="button"
          onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          disabled={nextDisabled}
          className="grid size-10 place-items-center rounded-xl border border-line hover:border-accent disabled:opacity-30"
          aria-label="Следующий месяц"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center" role="grid">
        {WEEK.map((w) => (
          <div key={w} className="pb-1 text-xs font-medium uppercase text-muted">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />
          const key = dateKey(d)
          const di = info[key]
          const unavailable = !di || di.total === 0
          const full = di && di.total > 0 && di.free === 0
          const disabled = loading || unavailable || full
          const selected = value === key
          return (
            <button
              type="button"
              key={key}
              disabled={disabled}
              onClick={() => onChange(key)}
              aria-pressed={selected}
              aria-label={`${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}${full ? ', всё занято' : di?.free ? `, свободно сеансов: ${di.free}` : ''}`}
              className={clsx(
                'relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition-all',
                selected && 'bg-accent font-semibold text-accent-fg shadow-[0_6px_20px_-6px_var(--glow)]',
                !selected && !disabled && 'bg-surface-2 hover:ring-2 hover:ring-accent',
                full && 'bg-rose-500/10 text-rose-500/70 line-through',
                unavailable && 'text-muted/40',
                loading && 'animate-pulse',
                key === today && !selected && 'ring-1 ring-line',
              )}
            >
              {d.getDate()}
              {!disabled && di && (
                <span className={clsx('absolute bottom-1.5 size-1 rounded-full', selected ? 'bg-accent-fg' : di.free <= 2 ? 'bg-amber-500' : 'bg-emerald-500')} />
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-500" /> есть места
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-amber-500" /> мало мест
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-rose-500/70 line-through">12</span> всё занято
        </span>
      </div>
    </div>
  )
}
