import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowLeft, Clock, ShieldAlert, Users, Wallet } from 'lucide-react'
import { FearMeter } from '../components/FearMeter'
import { QuestCard, useBookAction } from '../components/QuestCard'
import { Badge, Button, EmptyState, Skeleton, buttonClass } from '../components/ui'
import { api } from '../lib/api'
import { rub } from '../lib/format'
import { useJsonLd, useQuests, useSeo } from '../lib/hooks'
import type { Quest } from '../lib/types'

export default function QuestPage() {
  const { slug } = useParams()
  const q = useQuery({ queryKey: ['quest', slug], queryFn: () => api<Quest>(`/quests/${slug}`), retry: false })
  const { data: all } = useQuests()
  const book = useBookAction()
  const quest = q.data
  useSeo(quest ? `${quest.title} — хоррор-квест «Чёрный ход»` : 'Квест — Чёрный ход', quest?.shortDescription)
  useJsonLd(
    'ld-quest',
    quest && {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: `Квест «${quest.title}»`,
      description: quest.shortDescription,
      image: new URL(quest.photoUrl, location.origin).href,
      duration: `PT${quest.durationMin}M`,
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      offers: { '@type': 'Offer', price: quest.basePrice, priceCurrency: 'RUB', url: location.href },
    },
  )

  if (q.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24">
        <EmptyState title="Квест не найден" text="Возможно, он закрыт на реконструкцию." action={<Link to="/#quests" className={buttonClass('primary')}>Все квесты</Link>} />
      </div>
    )
  }
  if (!quest) return <div className="mx-auto max-w-6xl px-4 py-14"><Skeleton className="h-[32rem]" /></div>

  return (
    <>
      <section className="grain relative -mt-16 overflow-hidden md:-mt-20">
        <img src={quest.photoUrl} alt="" className="absolute inset-0 -z-10 h-full w-full scale-110 object-cover blur-[6px]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/75 to-black/60" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-10 bg-gradient-to-t from-bg to-transparent" />
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-28 sm:px-6 md:pt-36 lg:grid-cols-[1fr_1.2fr]">
          <motion.img initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} src={quest.photoUrl} alt={`Квест «${quest.title}»`} className="aspect-[4/5] w-full rounded-2xl object-cover shadow-2xl" />
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex flex-col text-white">
            <Link to="/#quests" className="mb-6 flex items-center gap-2 text-sm text-white/70 hover:text-white">
              <ArrowLeft className="size-4" /> Все квесты
            </Link>
            <div className="mb-4 flex flex-wrap gap-2">
              {quest.tags.map((t) => (
                <Badge key={t} className="bg-white/10 text-white ring-white/20">{t}</Badge>
              ))}
            </div>
            <h1 className="font-display text-5xl font-bold uppercase leading-none sm:text-6xl">{quest.title}</h1>
            <p className="mt-5 text-lg text-white/85">{quest.shortDescription}</p>
            <FearMeter level={quest.fearLevel} className="mt-8 max-w-sm [&_.text-muted]:text-white/70" />
            <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                [Users, 'Игроков', `${quest.minPlayers}–${quest.maxPlayers}`],
                [Clock, 'Длительность', `${quest.durationMin} мин`],
                [ShieldAlert, 'Возраст', `${quest.minAge}+`],
                [Wallet, 'Цена', `от ${rub(quest.basePrice)}`],
              ].map(([Icon, k, v]) => {
                const I = Icon as typeof Users
                return (
                  <div key={k as string} className="rounded-xl border border-white/15 bg-white/5 p-3 backdrop-blur">
                    <I className="mb-2 size-5 text-[var(--accent)]" />
                    <dt className="text-xs text-white/65">{k as string}</dt>
                    <dd className="font-semibold">{v as string}</dd>
                  </div>
                )
              })}
            </dl>
            <div className="mt-8">
              <Button size="lg" onClick={() => book(quest.slug)}>Записаться</Button>
              <p className="mt-3 text-xs text-white/65">Вечером (с 17:00) и в выходные — {rub(quest.basePrice + quest.peakExtra)} за команду</p>
            </div>
          </motion.div>
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="mb-6 font-display text-2xl uppercase">Сюжет</h2>
        <div className="space-y-4 leading-relaxed text-muted">
          {quest.description.split('\n').filter(Boolean).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>
      {all && all.filter((x) => x.id !== quest.id).length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <h2 className="mb-6 font-display text-2xl uppercase">Другие квесты</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {all.filter((x) => x.id !== quest.id).slice(0, 2).map((x) => (
              <QuestCard key={x.id} quest={x} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
