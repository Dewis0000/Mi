import { useEffect, useMemo, useRef, useState } from 'react'

type Datum = { key: string; label: string; value: number }

/** «Красивые» деления оси: 0 / 5 000 / 10 000 … */
function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0]
  const raw = max / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.0', '')} млн` : n >= 1000 ? `${Math.round(n / 1000)} тыс` : String(n))

/**
 * Столбчатая диаграмма одного ряда: тонкие столбцы (≤24px) со скруглением 4px сверху,
 * волосяная сетка, подсказка на наведение и фокус, подпись только у максимума.
 */
export function ColumnChart({ data, format, height = 240, ariaLabel }: { data: Datum[]; format: (n: number) => string; height?: number; ariaLabel: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pad = { top: 24, right: 8, bottom: 28, left: 56 }
  const innerW = Math.max(10, width - pad.left - pad.right)
  const innerH = height - pad.top - pad.bottom
  const max = Math.max(0, ...data.map((d) => d.value))
  const ticks = useMemo(() => niceTicks(max), [max])
  const top = ticks[ticks.length - 1] || 1
  const band = innerW / Math.max(1, data.length)
  const barW = Math.max(2, Math.min(24, band - 2)) // 2px зазор между соседними столбцами
  const y = (v: number) => pad.top + innerH - (v / top) * innerH
  const maxIdx = data.findIndex((d) => d.value === max && max > 0)
  // подписи оси X — не чаще, чем помещаются
  const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(innerW / 56))))

  const column = (x: number, h: number) => {
    const r = Math.min(4, barW / 2, h)
    const b = pad.top + innerH
    if (h <= 0) return ''
    return `M${x},${b} V${b - h + r} Q${x},${b - h} ${x + r},${b - h} H${x + barW - r} Q${x + barW},${b - h} ${x + barW},${b - h + r} V${b} Z`
  }

  const hd = hover !== null ? data[hover] : null
  const tipLeft = hover !== null ? pad.left + band * hover + band / 2 : 0

  return (
    <div ref={wrap} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              {compact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.left + band * i + (band - barW) / 2
          const h = (d.value / top) * innerH
          return (
            <g key={d.key}>
              <path d={column(x, h)} fill="var(--series-1)" opacity={hover === null || hover === i ? 1 : 0.45} />
              {i % every === 0 && (
                <text x={pad.left + band * i + band / 2} y={height - 8} textAnchor="middle" className="fill-muted text-[11px] tabular-nums">
                  {d.label}
                </text>
              )}
              {i === maxIdx && (
                <text x={x + barW / 2} y={y(d.value) - 6} textAnchor="middle" className="fill-fg text-[11px] font-semibold">
                  {compact(d.value)}
                </text>
              )}
              {/* зона наведения шире столбца — вся полоса по высоте */}
              <rect
                x={pad.left + band * i}
                y={pad.top}
                width={band}
                height={innerH}
                fill="transparent"
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${d.label}: ${format(d.value)}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="outline-none"
              />
            </g>
          )
        })}
      </svg>
      {hd && (
        <div
          className="card pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(tipLeft, 60), width - 60), top: Math.max(y(hd.value) - 8, 40) }}
        >
          <div className="text-sm font-semibold">{format(hd.value)}</div>
          <div className="flex items-center gap-1.5 text-muted">
            <span className="h-0.5 w-3 rounded bg-[var(--series-1)]" />
            {hd.label}
          </div>
        </div>
      )}
    </div>
  )
}
