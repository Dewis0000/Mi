import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { Clock, ShieldAlert, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { rub } from '../lib/format'
import type { Quest } from '../lib/types'
import { FearMeter } from './FearMeter'
import { Button } from './ui'

/** Переход к записи: неавторизованного — на регистрацию с сохранением намерения */
export function useBookAction() {
  const { user } = useAuth()
  const navigate = useNavigate()
  return (slug: string) => {
    const target = `/book/${slug}`
    navigate(user ? target : `/auth?next=${encodeURIComponent(target)}`)
  }
}

export function QuestCard({ quest, size = 'md' }: { quest: Quest; size?: 'md' | 'lg' }) {
  const book = useBookAction()
  const lg = size === 'lg'
  return (
    <motion.article
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={clsx(
        'card group relative flex h-full flex-col overflow-hidden sm:flex-row',
        'hover:border-accent/50 hover:shadow-[0_20px_60px_-25px_var(--glow)] transition-[border-color,box-shadow] duration-300',
      )}
    >
      {/* слева — фото и уровень страха */}
      <div className={clsx('flex shrink-0 flex-col gap-3 p-3 sm:pr-0', lg ? 'sm:w-[44%]' : 'sm:w-[42%]')}>
        <Link to={`/quests/${quest.slug}`} className="relative block flex-1 overflow-hidden rounded-xl" aria-label={`Подробнее о квесте «${quest.title}»`}>
          <img
            src={quest.photoUrl}
            alt={`Квест «${quest.title}»`}
            loading="lazy"
            decoding="async"
            className={clsx(
              'h-full w-full object-cover transition-transform duration-700 group-hover:scale-105',
              lg ? 'aspect-[4/3] sm:aspect-auto sm:min-h-[22rem]' : 'aspect-[4/3] sm:aspect-auto sm:min-h-[16rem]',
            )}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent" />
          <span className="absolute left-3 top-3 rounded-lg bg-black/60 px-2 py-1 text-xs font-bold text-white backdrop-blur">{quest.minAge}+</span>
        </Link>
        <FearMeter level={quest.fearLevel} className="px-1 pb-1" />
      </div>

      {/* справа — описание и параметры */}
      <div className={clsx('flex flex-1 flex-col p-5', lg && 'sm:p-8')}>
        <h3 className={clsx('font-display font-semibold uppercase tracking-wide', lg ? 'text-3xl sm:text-4xl' : 'text-2xl')}>
          <Link to={`/quests/${quest.slug}`} className="hover:text-accent">
            {quest.title}
          </Link>
        </h3>
        <p className={clsx('mt-3 text-sm leading-relaxed text-muted', lg ? 'line-clamp-4 sm:text-base' : 'line-clamp-3')}>{quest.shortDescription}</p>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-accent" aria-hidden />
            <dt className="sr-only">Игроков</dt>
            <dd>
              от {quest.minPlayers} до {quest.maxPlayers}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-accent" aria-hidden />
            <dt className="sr-only">Длительность</dt>
            <dd>{quest.durationMin} минут</dd>
          </div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-accent" aria-hidden />
            <dt className="sr-only">Возраст</dt>
            <dd>{quest.minAge}+</dd>
          </div>
        </dl>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-6">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted">Цена</div>
            <div className="font-display text-2xl font-semibold">от {rub(quest.basePrice)}</div>
          </div>
          <Button onClick={() => book(quest.slug)} size={lg ? 'lg' : 'md'}>
            Записаться
          </Button>
        </div>
      </div>
    </motion.article>
  )
}
