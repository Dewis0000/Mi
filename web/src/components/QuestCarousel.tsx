import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Quest } from '../lib/types'
import { QuestCard } from './QuestCard'
import { Skeleton } from './ui'

/**
 * Активные квесты:
 *  ≥3 — горизонтальная карусель (стрелки, свайп, точки);
 *  2 — карточки по центру, без карусели;
 *  1 — одна увеличенная карточка.
 */
export function QuestCarousel({ quests, loading }: { quests: Quest[] | undefined; loading?: boolean }) {
  if (loading || !quests) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-96" />
        <Skeleton className="hidden h-96 md:block" />
      </div>
    )
  }
  if (quests.length === 0) {
    return <p className="text-muted">Сейчас все комнаты на реконструкции. Скоро вернёмся — страшнее, чем прежде.</p>
  }
  if (quests.length === 1) {
    return (
      <div className="mx-auto max-w-5xl">
        <QuestCard quest={quests[0]} size="lg" />
      </div>
    )
  }
  if (quests.length === 2) {
    return (
      <div className="mx-auto grid max-w-6xl justify-center gap-6 lg:grid-cols-2">
        {quests.map((q) => (
          <QuestCard key={q.id} quest={q} />
        ))}
      </div>
    )
  }
  return <Carousel quests={quests} />
}

function Carousel({ quests }: { quests: Quest[] }) {
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [edges, setEdges] = useState({ start: true, end: false })

  const update = useCallback(() => {
    const el = track.current
    if (!el) return
    const items = Array.from(el.children) as HTMLElement[]
    const center = el.scrollLeft + el.clientWidth / 2
    let best = 0
    items.forEach((it, i) => {
      const c = it.offsetLeft + it.clientWidth / 2
      if (Math.abs(c - center) < Math.abs(items[best].offsetLeft + items[best].clientWidth / 2 - center)) best = i
    })
    if (el.scrollLeft < 8) best = 0
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 8) best = items.length - 1
    setActive(best)
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 })
  }, [])

  useEffect(() => {
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [update])

  const go = (i: number) => {
    const el = track.current
    const item = el?.children[i] as HTMLElement | undefined
    if (!el || !item) return
    el.scrollTo({ left: item.offsetLeft - (el.clientWidth - item.clientWidth) / 2, behavior: 'smooth' })
  }

  return (
    <div className="relative" role="region" aria-roledescription="карусель" aria-label="Активные квесты">
      <div
        ref={track}
        onScroll={update}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(Math.min(active + 1, quests.length - 1))
          if (e.key === 'ArrowLeft') go(Math.max(active - 1, 0))
        }}
        tabIndex={0}
        className="no-scrollbar relative -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-4 pb-4 sm:-mx-6 sm:px-6"
      >
        {quests.map((q, i) => (
          <div
            key={q.id}
            className="w-[86%] shrink-0 snap-center sm:w-[80%] lg:w-[46%] xl:w-[44%]"
            aria-roledescription="слайд"
            aria-label={`${i + 1} из ${quests.length}`}
          >
            <QuestCard quest={q} />
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="flex gap-2" role="tablist" aria-label="Выбор слайда">
          {quests.map((q, i) => (
            <button
              key={q.id}
              role="tab"
              aria-selected={active === i}
              aria-label={`Квест ${i + 1}: ${q.title}`}
              onClick={() => go(i)}
              className={clsx('h-2 rounded-full transition-all', active === i ? 'w-8 bg-accent' : 'w-2 bg-line hover:bg-muted')}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => go(Math.max(active - 1, 0))}
            disabled={edges.start}
            aria-label="Предыдущий квест"
            className="grid size-12 place-items-center rounded-full border border-line transition-colors hover:border-accent hover:text-accent disabled:opacity-30"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            onClick={() => go(Math.min(active + 1, quests.length - 1))}
            disabled={edges.end}
            aria-label="Следующий квест"
            className="grid size-12 place-items-center rounded-full border border-line transition-colors hover:border-accent hover:text-accent disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
