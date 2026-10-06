import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { FileSpreadsheet } from 'lucide-react'
import { ColumnChart } from '../../components/ColumnChart'
import { Button, ErrorBox, Skeleton, useUi } from '../../components/ui'
import { api, download, errorMessage, isDemoNotice } from '../../lib/api'
import { fmtDate, rub } from '../../lib/format'
import { DateRange, PageHeader, presetRange } from './shared'

type Report = {
  revenue: number
  recordingsRevenue: number
  prepayments: number
  bookings: number
  completed: number
  cancelled: number
  noShows: number
  upcoming: number
  avgCheck: number
  conversion: number
  bySource: { source: string; count: number }[]
  byQuest: { questId: string; title: string; sessions: number; totalSlots: number; load: number; revenue: number; players: number }[]
  byDay: { date: string; revenue: number; bookings: number }[]
}

function Tile({ label, value, hint, small }: { label: string; value: string | number; hint?: string; small?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={small ? 'mt-1.5 text-sm font-medium leading-snug' : 'mt-1 text-2xl font-semibold'}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export default function Reports() {
  const [range, setRange] = useState(() => presetRange(29))
  const [exporting, setExporting] = useState<string | null>(null)
  const { toast } = useUi()
  const q = useQuery({
    queryKey: ['admin', 'reports', range],
    queryFn: () => api<Report>('/admin/reports', { query: range }),
    placeholderData: keepPreviousData,
    enabled: !!range.from && !!range.to && range.from <= range.to,
  })
  const r = q.data

  async function exportFile(format: 'csv' | 'xlsx') {
    setExporting(format)
    try {
      await download('/admin/reports/export', { ...range, format }, `report_${range.from}_${range.to}.${format}`)
    } catch (e) {
      toast(errorMessage(e), isDemoNotice(e) ? 'info' : 'error')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div>
      <PageHeader title="Отчётность" />
      {/* фильтр периода — одной строкой над всеми показателями */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <DateRange value={range} onChange={setRange} />
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" loading={exporting === 'xlsx'} onClick={() => exportFile('xlsx')}><FileSpreadsheet className="size-4" /> Excel</Button>
          <Button size="sm" variant="secondary" loading={exporting === 'csv'} onClick={() => exportFile('csv')}>CSV</Button>
        </div>
      </div>

      {q.error && <ErrorBox error={q.error} onRetry={q.refetch} />}
      {!r ? (
        <Skeleton className="h-[32rem]" />
      ) : (
        <div className={clsx('space-y-6 transition-opacity', q.isFetching && 'opacity-60')}>
          <div className="grid gap-4 lg:grid-cols-[1.2fr_2fr]">
            <div className="card flex flex-col justify-center p-6">
              <p className="text-sm text-muted">Выручка за период</p>
              <p className="mt-1 text-5xl font-semibold">{rub(r.revenue)}</p>
              <p className="mt-2 text-xs text-muted">
                По завершённым играм. Видеозаписи: {rub(r.recordingsRevenue)} · предоплаты: {rub(r.prepayments)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Tile label="Средний чек" value={rub(r.avgCheck)} />
              <Tile label="Заявок" value={r.bookings} hint={`${r.completed} завершено · ${r.upcoming} впереди`} />
              <Tile label="Конверсия" value={`${r.conversion}%`} hint="Заявка → состоявшаяся игра" />
              <Tile label="Неявки" value={r.noShows} />
              <Tile label="Отмены" value={r.cancelled} />
              <Tile label="Источники заявок" small value={r.bySource.filter((s) => s.count).map((s) => `${s.source}: ${s.count}`).join(' · ') || '—'} />
            </div>
          </div>

          <section className="card p-5">
            <h2 className="font-display uppercase">Выручка по дням</h2>
            <p className="mb-4 text-xs text-muted">Завершённые игры, ₽</p>
            <ColumnChart
              ariaLabel="Выручка по дням"
              format={rub}
              data={r.byDay.map((d) => ({ key: d.date, label: fmtDate(d.date, { day: 'numeric', month: 'short' }), value: d.revenue }))}
            />
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-muted hover:text-fg">Показать таблицей</summary>
              <div className="mt-3 max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted">
                    <tr><th className="p-2 font-medium">Дата</th><th className="p-2 text-right font-medium">Заявок</th><th className="p-2 text-right font-medium">Выручка</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {r.byDay.map((d) => (
                      <tr key={d.date}><td className="p-2">{fmtDate(d.date, { day: 'numeric', month: 'long', weekday: 'short' })}</td><td className="p-2 text-right tabular-nums">{d.bookings}</td><td className="p-2 text-right tabular-nums">{rub(d.revenue)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <section className="card overflow-hidden">
            <h2 className="border-b border-line p-4 font-display uppercase">Загрузка по квестам</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="p-3 font-medium">Квест</th>
                    <th className="p-3 font-medium">Загрузка</th>
                    <th className="p-3 text-right font-medium">Сеансов</th>
                    <th className="p-3 text-right font-medium">Игроков</th>
                    <th className="p-3 text-right font-medium">Выручка</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.byQuest.map((qq) => (
                    <tr key={qq.questId}>
                      <td className="p-3">{qq.title}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-32 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--series-1)_18%,transparent)]" role="meter" aria-valuenow={qq.load} aria-valuemin={0} aria-valuemax={100} aria-label={`Загрузка ${qq.title}`}>
                            <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${Math.min(100, qq.load)}%` }} />
                          </div>
                          <span className="tabular-nums">{qq.load}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-right tabular-nums">{qq.sessions} / {qq.totalSlots}</td>
                      <td className="p-3 text-right tabular-nums">{qq.players}</td>
                      <td className="p-3 text-right tabular-nums">{rub(qq.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
