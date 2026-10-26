import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Gift,
  Play,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/motion/fade-in";
import { siteConfig } from "@/lib/site-config";
import { prisma } from "@/lib/db";
import { GENRE_LABELS, DIFFICULTY_LABELS, formatPlayers, formatPrice } from "@/lib/room-labels";

export const dynamic = "force-dynamic";

async function getFeaturedQuests() {
  return prisma.room.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    take: 3,
  });
}

const steps = [
  {
    icon: CalendarCheck,
    title: "Выберите квест и время",
    text: "Смотрите свободные слоты в реальном времени и бронируйте онлайн за 2 минуты.",
  },
  {
    icon: Users,
    title: "Соберите команду",
    text: "От 2 до 8 игроков — мы подскажем, какой квест подойдёт вашей компании.",
  },
  {
    icon: Play,
    title: "Играйте 60 минут",
    text: "Актёры и живые декорации — вы окажетесь внутри настоящей истории.",
  },
  {
    icon: Gift,
    title: "Получайте баллы и видео",
    text: "За каждое посещение — баллы на скидку, а запись игры можно забрать на память.",
  },
];

export default async function HomePage() {
  const featuredQuests = await getFeaturedQuests();

  return (
    <div>
      <section className="relative overflow-hidden border-b">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8 lg:py-28">
          <FadeIn>
            <Badge variant="secondary" className="mb-4">
              <Sparkles className="size-3.5" /> Новые квесты каждый сезон
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Квесты в реальности,
              <br />
              от которых мурашки
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              {siteConfig.description} Бронируйте онлайн, следите за прогрессом
              и получайте баллы за каждое посещение «{siteConfig.name}».
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" render={<Link href="/quests" />}>
                Выбрать квест <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="outline" render={<Link href="/loyalty" />}>
                Программа лояльности
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Star className="size-4 fill-current text-amber-500" />
                4.9 по отзывам игроков
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="size-4" />
                Безопасно и с инструктажем
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/20 via-primary/5 to-background shadow-xl">
              <div className="absolute inset-0 flex items-center justify-center">
                <Play className="size-20 text-primary/40" />
              </div>
              <div className="absolute bottom-4 left-4 right-4 rounded-xl border bg-background/90 p-4 backdrop-blur">
                <p className="text-sm font-medium">Прямой эфир из комнаты</p>
                <p className="text-xs text-muted-foreground">
                  Смотрите, как ваша команда проходит квест, — в личном кабинете
                </p>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      <section className="border-b bg-card/50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <FadeIn>
            <h2 className="text-center text-2xl font-bold sm:text-3xl">Как это устроено</h2>
          </FadeIn>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <FadeIn key={step.title} delay={i * 0.08}>
                <div className="flex flex-col gap-3 rounded-xl border bg-background p-5">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <step.icon className="size-5" />
                  </div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.text}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <FadeIn className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">Популярные квесты</h2>
            <p className="mt-1 text-muted-foreground">Выбирайте по жанру, сложности и составу команды</p>
          </div>
          <Button variant="outline" render={<Link href="/quests" />}>
            Весь каталог <ArrowRight className="size-4" />
          </Button>
        </FadeIn>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featuredQuests.map((quest, i) => (
            <FadeIn key={quest.slug} delay={i * 0.08}>
              <Link href={`/quests/${quest.slug}`}>
                <Card className="group h-full overflow-hidden transition-shadow hover:shadow-lg">
                  <div className="relative aspect-[16/10] bg-gradient-to-br from-primary/25 via-primary/10 to-muted" />
                  <CardContent className="space-y-2 pt-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{GENRE_LABELS[quest.genre]}</Badge>
                      <Badge variant="outline">{DIFFICULTY_LABELS[quest.difficulty]}</Badge>
                    </div>
                    <h3 className="font-heading text-lg font-semibold group-hover:text-primary">
                      {quest.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {formatPlayers(quest.minPlayers, quest.maxPlayers)} · {quest.durationMinutes} минут
                    </p>
                    <p className="pt-1 text-sm font-medium">от {formatPrice(quest.basePrice)}</p>
                  </CardContent>
                </Card>
              </Link>
            </FadeIn>
          ))}
        </div>
      </section>

      <section className="border-y bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 lg:flex-row lg:justify-between lg:text-left lg:px-8">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">Баллы за каждое посещение</h2>
            <p className="mt-2 max-w-lg text-primary-foreground/80">
              Проходите квесты — копите баллы, растите в уровнях и получайте скидки
              и бонусные игры.
            </p>
          </div>
          <Button size="lg" variant="secondary" render={<Link href="/loyalty" />}>
            Узнать подробнее <ArrowRight className="size-4" />
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <FadeIn className="text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Для компаний и праздников</h2>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            Дни рождения, корпоративы и тимбилдинг — подберём квест под любую команду
          </p>
          <Button className="mt-6" variant="outline" render={<Link href="/business" />}>
            Подробнее о мероприятиях
          </Button>
        </FadeIn>
      </section>
    </div>
  );
}
