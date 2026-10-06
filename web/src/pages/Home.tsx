import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Camera,
  Clock,
  DoorOpen,
  ExternalLink,
  Gift,
  Heart,
  MapPin,
  PartyPopper,
  Phone,
  ShieldAlert,
  Skull,
  Sparkles,
  Users,
  Video,
} from 'lucide-react'
import { QuestCarousel } from '../components/QuestCarousel'
import { Socials } from '../components/Socials'
import { Accordion, Reveal, SectionTitle, Skeleton, buttonClass } from '../components/ui'
import { DEMO } from '../lib/env'
import { useContent, useJsonLd, useQuests, useSeo } from '../lib/hooks'
import { rub } from '../lib/format'

function Hero() {
  const { data } = useContent()
  const site = data?.site
  return (
    <section className="grain relative -mt-16 flex min-h-[88vh] items-center overflow-hidden md:-mt-20 md:min-h-screen">
      {/* фон: фото с размытием и тёмным оверлеем для читаемости */}
      <div className="absolute inset-0 -z-10">
        <img
          src="/images/fon.webp"
          alt=""
          fetchPriority="high"
          className="h-full w-full scale-110 object-cover blur-[8px]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/50" />
        {/* переход в фон страницы — только ниже текста, чтобы не ухудшать контраст в светлой теме */}
        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-bg to-transparent" />
        <div className="fog absolute -inset-x-1/4 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.10),transparent_65%)]" />
        <div className="absolute -left-40 top-1/3 size-[36rem] rounded-full bg-[var(--accent)] opacity-[0.12] blur-[120px]" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-32 sm:px-6">
        <div className="max-w-2xl text-white">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-white/85 backdrop-blur"
          >
            <span className="flicker size-2 rounded-full bg-[var(--accent)]" />
            {site?.tagline ?? 'Хоррор-квесты в реальности'}
          </motion.p>
          {site ? (
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="whitespace-pre-line font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl xl:text-8xl"
            >
              {site.heroTitle}
            </motion.h1>
          ) : (
            <Skeleton className="h-40 w-full bg-white/10" />
          )}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-white/85"
          >
            {site?.heroText}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <a href="#quests" className={buttonClass('primary', 'lg')}>
              Записаться <ArrowRight className="size-5" />
            </a>
            <a href="#about" className="text-sm font-medium uppercase tracking-wider text-white/80 underline-offset-8 hover:text-white hover:underline">
              Как это устроено
            </a>
          </motion.div>
          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-14 grid max-w-lg grid-cols-3 gap-6 border-t border-white/15 pt-6"
          >
            {[
              ['3500 ₽', 'команда до 5 человек'],
              ['до 7', 'игроков в команде'],
              ['~1 час', 'длится игра'],
            ].map(([n, l]) => (
              <div key={l}>
                <dt className="sr-only">{l}</dt>
                <dd className="font-display text-3xl font-semibold text-white sm:text-4xl">{n}</dd>
                <dd className="mt-1 text-xs uppercase tracking-wider text-white/65">{l}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
      </div>
    </section>
  )
}

function QuestsSection() {
  const { data, isLoading } = useQuests()
  return (
    <section id="quests" className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <SectionTitle
        eyebrow="Наш квест"
        title={
          <>
            Встреча с <span className="text-accent">Графом</span>
          </>
        }
        text="Хоррор-квест с живым актёром и тремя уровнями сложности. Уровень и интенсивность взаимодействия выбираете прямо перед игрой — от спокойного до хардкора."
      />
      <QuestCarousel quests={data} loading={isLoading} />
    </section>
  )
}

const included = [
  { icon: DoorOpen, title: 'Полное погружение', text: 'Атмосферные декорации, свет и звук. На час вы забудете, что находитесь в городе.' },
  { icon: Users, title: 'Живой актёр', text: 'Актёр ведёт историю и играет вокруг вас — настолько близко, насколько вы сами захотите.' },
  { icon: Skull, title: 'Три уровня сложности', text: 'Сложность и интенсивность взаимодействия выбираете перед игрой: от спокойного до хардкора.' },
  { icon: PartyPopper, title: 'Комната отдыха', text: 'После игры — чай и празднование в комнате отдыха. Можно заказать праздничное оформление.' },
]

const options = [
  { icon: PartyPopper, title: 'Комната отдыха', text: 'Уютное пространство для чаепития и праздника после игры. Почасовая аренда.', price: '500 ₽/час' },
  { icon: Sparkles, title: 'Надпись «С днём рождения»', text: 'Праздничное оформление комнаты отдыха.', price: '200 ₽' },
  { icon: Gift, title: 'Цветная посуда', text: 'Одноразовая праздничная посуда на всю компанию.', price: '200 ₽' },
  { icon: Heart, title: 'Воздушные шары', text: '20 воздушных шаров по комнате отдыха.', price: '200 ₽' },
]

const rules = [
  'Для записи нужна предоплата 500 ₽ — реквизиты пришлём после подтверждения заявки.',
  'Возврат предоплаты — при отмене минимум за сутки. Отмена в день игры: предоплата удерживается.',
  'Приходите за 10 минут до начала игры.',
  'С собой — чистая сменная обувь.',
  'Количество и возраст участников, комнату отдыха и оформление уточним перед игрой.',
]

function InfoSection() {
  const { data } = useContent()
  const faq = useMemo(
    () => [
      { q: 'Насколько это страшно?', a: 'Вы сами выбираете уровень прямо перед игрой — от спокойного (атмосферно, минимум контакта) до хардкора (максимум взаимодействия с актёром).' },
      { q: 'Сколько человек можно привести?', a: 'От 1 до 7 человек. Базовая цена 3500 ₽ — за команду до 5 человек, каждый следующий игрок +700 ₽.' },
      { q: 'Как записаться и внести предоплату?', a: 'Оставьте заявку на сайте или свяжитесь с нами — мы подтвердим время и пришлём реквизиты для предоплаты 500 ₽.' },
      { q: 'Можно ли отменить запись?', a: 'Да. При отмене минимум за сутки предоплата возвращается. При отмене в день игры предоплата удерживается.' },
      { q: 'Что надеть?', a: 'Удобную одежду и обязательно чистую сменную обувь. Приходите за 10 минут до начала игры.' },
      { q: 'Можно ли отметить день рождения?', a: 'Да! Есть комната отдыха (500 ₽/час) и оформление: надпись «С днём рождения», цветная посуда и воздушные шары — по 200 ₽ каждое.' },
    ],
    [],
  )

  return (
    <section id="about" className="relative border-y border-line bg-surface/60 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionTitle eyebrow="Информация" title="Что вас ждёт за дверью" text={data?.site.aboutText} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {included.map((it, i) => (
            <Reveal key={it.title} delay={i * 0.06}>
              <div className="card h-full p-6">
                <it.icon className="mb-4 size-7 text-accent" aria-hidden />
                <h3 className="font-display text-lg uppercase tracking-wide">{it.title}</h3>
                <p className="mt-2 text-sm text-muted">{it.text}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <h3 className="mb-6 mt-20 font-display text-2xl uppercase tracking-wide">Дополнительные опции</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((o, i) => (
            <Reveal key={o.title} delay={i * 0.05}>
              <div className="group flex h-full gap-4 rounded-2xl border border-line p-5 transition-colors hover:border-accent/50">
                <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                  <o.icon className="size-6" aria-hidden />
                </div>
                <div>
                  <h4 className="font-semibold">{o.title}</h4>
                  <p className="mt-1 text-sm text-muted">{o.text}</p>
                  {o.price && <p className="mt-2 text-sm font-medium text-accent">{o.price}</p>}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-20 grid gap-12 lg:grid-cols-2">
          <Reveal>
            <h3 id="rules" className="mb-6 font-display text-2xl uppercase tracking-wide">
              Правила посещения
            </h3>
            <ol className="space-y-4">
              {rules.map((r, i) => (
                <li key={i} className="flex gap-4">
                  <span className="font-display text-2xl leading-none text-accent">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-sm leading-relaxed text-muted">{r}</span>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal delay={0.1}>
            <h3 className="mb-6 font-display text-2xl uppercase tracking-wide">Частые вопросы</h3>
            <Accordion items={faq} />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function AddressSection() {
  const { data } = useContent()
  const c = data?.contacts
  const routeUrl = c?.mapUrl || (c ? `https://yandex.ru/maps/?rtext=~${c.lat},${c.lon}&rtt=auto` : '#')
  return (
    <section id="address" className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <SectionTitle eyebrow="Адрес" title="Как нас найти" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <Reveal className="card flex flex-col gap-6 p-6 sm:p-8">
          {c ? (
            <>
              <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="group flex gap-4">
                <MapPin className="mt-1 size-6 shrink-0 text-accent" />
                <span>
                  <span className="block text-lg font-semibold group-hover:text-accent">{c.address}</span>
                  <span className="mt-1 block text-sm text-muted">{c.addressNote}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm text-accent">
                    Построить маршрут <ExternalLink className="size-3.5" />
                  </span>
                </span>
              </a>
              <div className="flex gap-4">
                <Phone className="mt-1 size-6 shrink-0 text-accent" />
                <span>
                  <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="block text-lg font-semibold hover:text-accent">
                    {c.phone}
                  </a>
                  <span className="text-sm text-muted">Звоните, если опаздываете</span>
                </span>
              </div>
              <div className="flex gap-4">
                <Clock className="mt-1 size-6 shrink-0 text-accent" />
                <span>
                  <span className="block text-lg font-semibold">{c.hours}</span>
                  <span className="text-sm text-muted">Лучше записаться заранее</span>
                </span>
              </div>
              {(c.telegram || c.vk || c.max) && (
                <div className="mt-auto border-t border-line pt-6">
                  <p className="mb-3 text-sm text-muted">Мы в соцсетях</p>
                  <Socials contacts={c} />
                </div>
              )}
            </>
          ) : (
            <Skeleton className="h-64" />
          )}
        </Reveal>
        <Reveal delay={0.1} className="relative min-h-[22rem] overflow-hidden rounded-[1.25rem] border border-line bg-surface-2">
          {/* подложка на случай, если виджет карты не загрузится */}
          <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-[size:48px_48px] opacity-60" aria-hidden>
            <MapPin className="size-12 text-accent" />
          </div>
          {c && (
            <>
              {!DEMO && <iframe
                title="Карта: как добраться"
                src={`https://yandex.ru/map-widget/v1/?ll=${c.lon},${c.lat}&z=16&pt=${c.lon},${c.lat},pm2rdm`}
                className="absolute inset-0 h-full w-full grayscale-[0.4] light:grayscale-0"
                loading="lazy"
                tabIndex={-1}
              />}
              {/* клик по карте — переход к построению маршрута */}
              <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-10" aria-label="Открыть маршрут в Яндекс.Картах">
                <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-xl bg-black/80 px-4 py-2.5 text-sm font-medium text-white backdrop-blur">
                  <MapPin className="size-4 text-[var(--accent)]" /> Открыть маршрут <ExternalLink className="size-3.5" />
                </span>
              </a>
            </>
          )}
        </Reveal>
      </div>
    </section>
  )
}

function LoyaltyTeaser() {
  const { data } = useContent()
  if (!data) return null
  const max = Math.max(...data.loyalty.tiers.map((t) => t.percent))
  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      <Reveal className="relative overflow-hidden rounded-[1.5rem] border border-accent/30 bg-gradient-to-br from-accent/20 via-surface to-surface p-8 sm:p-12">
        <Heart className="absolute -bottom-10 right-1/3 size-48 rotate-12 text-accent/[0.07]" aria-hidden />
        <div className="relative grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Программа лояльности</p>
            <h2 className="mt-3 font-display text-3xl uppercase sm:text-4xl">Возвращайтесь — и бойтесь дешевле</h2>
            <p className="mt-3 max-w-2xl text-muted">
              {data.loyalty.pointsPerVisit} баллов за каждое посещение и постоянная скидка до {max}%. Баллы копятся автоматически после игры.
            </p>
          </div>
          <a href="#quests" className={buttonClass('outline', 'md')}>
            Выбрать квест <ArrowRight className="size-4" />
          </a>
        </div>
      </Reveal>
    </section>
  )
}

export default function Home() {
  const { data: content } = useContent()
  const { data: quests } = useQuests()
  useSeo('Neru-Квест — хоррор-квест «Граф Дракула» в Нерюнгри', 'Хоррор-квест «Граф Дракула» с живым актёром в Нерюнгри. Три уровня сложности, ~1 час, от 1 до 7 игроков. Онлайн-заявка на игру.')

  const ld = useMemo(() => {
    if (!content) return null
    const c = content.contacts
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'LocalBusiness',
          '@id': `${location.origin}/#business`,
          name: content.site.name,
          description: content.site.tagline,
          image: `${location.origin}/images/og.jpg`,
          telephone: c.phone,
          email: c.email,
          address: { '@type': 'PostalAddress', streetAddress: c.address, addressCountry: 'RU' },
          geo: { '@type': 'GeoCoordinates', latitude: c.lat, longitude: c.lon },
          openingHours: 'Mo-Su 10:00-22:00',
          url: location.origin,
          sameAs: [c.telegram, c.vk, c.max].filter(Boolean),
        },
        ...(quests ?? []).map((q) => ({
          '@type': 'Event',
          name: `Квест «${q.title}»`,
          description: q.shortDescription,
          image: new URL(q.photoUrl, location.origin).href,
          eventStatus: 'https://schema.org/EventScheduled',
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          typicalAgeRange: `${q.minAge}-`,
          duration: `PT${q.durationMin}M`,
          location: { '@id': `${location.origin}/#business` },
          offers: { '@type': 'Offer', price: q.basePrice, priceCurrency: 'RUB', url: `${location.origin}/quests/${q.slug}`, availability: 'https://schema.org/InStock' },
          organizer: { '@type': 'Organization', name: content.site.name, url: location.origin },
          startDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        })),
      ],
    }
  }, [content, quests])
  useJsonLd('ld-home', ld)

  return (
    <>
      <Hero />
      <QuestsSection />
      <InfoSection />
      <AddressSection />
    </>
  )
}
