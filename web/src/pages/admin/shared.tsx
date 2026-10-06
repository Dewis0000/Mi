import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '../../components/ui'
import { api } from '../../lib/api'
import { STATUS_COLOR, STATUS_SHORT, venueDateKey } from '../../lib/format'
import type { AdminQuest } from '../../lib/types'

export const useAdminQuests = () => useQuery({ queryKey: ['admin', 'quests'], queryFn: () => api<AdminQuest[]>('/admin/quests') })

export function StatusPill({ status }: { status: string }) {
  return <Badge className={STATUS_COLOR[status]}>{STATUS_SHORT[status]}</Badge>
}

export function PageHeader({ title, children, text }: { title: string; text?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-wide">{title}</h1>
        {text && <p className="mt-1 text-sm text-muted">{text}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line p-3 text-sm">
      <span className="text-muted">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} из {total}
      </span>
      <div className="flex gap-1">
        <button className="grid size-9 place-items-center rounded-lg border border-line disabled:opacity-30" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Назад">
          <ChevronLeft className="size-4" />
        </button>
        <button className="grid size-9 place-items-center rounded-lg border border-line disabled:opacity-30" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Вперёд">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}

export const PRESETS = [
  { id: 'today', label: 'Сегодня', days: 0 },
  { id: '7', label: '7 дней', days: 6 },
  { id: '30', label: '30 дней', days: 29 },
  { id: '90', label: '90 дней', days: 89 },
] as const

export function presetRange(days: number, forward = false) {
  const now = new Date()
  const other = new Date(now.getTime() + (forward ? days : -days) * 86_400_000)
  return forward ? { from: venueDateKey(now), to: venueDateKey(other) } : { from: venueDateKey(other), to: venueDateKey(now) }
}

/** Фильтр периода: пресеты + произвольный диапазон */
export function DateRange({
  value,
  onChange,
  presets = true,
}: {
  value: { from: string; to: string }
  onChange: (v: { from: string; to: string }) => void
  presets?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets &&
        PRESETS.map((p) => {
          const r = presetRange(p.days)
          const active = r.from === value.from && r.to === value.to
          return (
            <button
              key={p.id}
              onClick={() => onChange(r)}
              className={clsx('h-9 rounded-lg border px-3 text-sm', active ? 'border-accent bg-accent/10 font-medium text-accent' : 'border-line text-muted hover:text-fg')}
            >
              {p.label}
            </button>
          )
        })}
      <div className="flex items-center gap-1.5 text-sm">
        <input type="date" className="input h-9 w-auto py-1" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} aria-label="С даты" />
        <span className="text-muted">—</span>
        <input type="date" className="input h-9 w-auto py-1" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} aria-label="По дату" />
      </div>
    </div>
  )
}

export const SOURCE_LABEL: Record<string, string> = { WEB: 'Сайт', ADMIN: 'Админ', PHONE: 'Телефон', WALK_IN: 'Без записи' }
