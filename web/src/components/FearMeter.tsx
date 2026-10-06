import clsx from 'clsx'
import { FEAR_LEVELS } from '../lib/format'

/** Шкала уровня страха: 5 делений от «Лёгкий» до «Экстрим» */
export function FearMeter({ level, className, compact }: { level: number; className?: string; compact?: boolean }) {
  const current = FEAR_LEVELS[Math.min(Math.max(level, 1), 5) - 1]
  return (
    <div className={clsx('space-y-1.5', className)} role="img" aria-label={`Уровень страха: ${current.label}, ${level} из 5`}>
      {!compact && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
          <span className="whitespace-nowrap uppercase tracking-[0.14em] text-muted">Уровень страха</span>
          <span className="whitespace-nowrap font-semibold" style={{ color: current.color }}>
            {current.label}
          </span>
        </div>
      )}
      <div className="flex gap-1">
        {FEAR_LEVELS.map((l, i) => (
          <span
            key={l.label}
            title={l.label}
            className="h-1.5 flex-1 rounded-full transition-all"
            style={{
              background: i < level ? current.color : 'var(--border)',
              boxShadow: i < level ? `0 0 10px ${current.color}66` : undefined,
            }}
          />
        ))}
      </div>
    </div>
  )
}
