import Link from "next/link";
import { FileEdit, Gamepad2, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MascotBubble } from "@/components/mascot-bubble";
import { HeroBuzzer } from "@/components/hero-buzzer";
import { BoardPreview } from "@/components/game/board-preview";
import { ShameCard } from "@/components/shame-card";
import { Reveal } from "@/components/reveal";
import { demoPack, hallOfShame } from "@/lib/demo-data";

const FEATURES = [
  {
    icon: FileEdit,
    title: "Свой пакет вопросов",
    text: "Любые категории, любые вопросы. Хочешь — трэш про котов, хочешь — заумь про Канта. Решаешь ты.",
  },
  {
    icon: Gamepad2,
    title: "Настоящая кнопка",
    text: "Жми на баззер, как в телевизоре. Кто быстрее — тот и выпендривается первым.",
  },
  {
    icon: Trophy,
    title: "Зал Позора",
    text: "Каждый эпично неверный ответ навечно остаётся в истории. Для потомков и смеха.",
  },
  {
    icon: Users,
    title: "Игра с друзьями",
    text: "Создай комнату, скинь код, смотри, кто на самом деле ничего не знает.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 pt-14 pb-20 text-center sm:px-6 sm:pt-20">
        <Link
          href="/hall-of-shame"
          className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-foreground/10 transition-colors hover:text-foreground"
        >
          🦚 Своя игра, в которую не стыдно звать друзей
        </Link>

        <h1 className="max-w-3xl font-display text-4xl font-extrabold leading-[1.05] sm:text-6xl">
          Своя игра. <span className="text-primary">Свой выпендрёж.</span>{" "}
          Свои правила.
        </h1>

        <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
          Собери пакет вопросов за пять минут, позови друзей и узнай, кто у вас
          самый умный — а кто просто громче всех выпендривается.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            className="glow-primary h-11 px-6 text-base"
            nativeButton={false}
            render={<Link href="/play/demo" />}
          >
            🎮 Играть демо
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 px-6 text-base"
            nativeButton={false}
            render={<Link href="/create" />}
          >
            ✍️ Создать игру
          </Button>
        </div>

        <MascotBubble
          className="mt-4 text-left"
          text="Меня зовут Павел Павлинович. Я здесь, чтобы комментировать твои ответы. Местами жёстко."
        />

        <HeroBuzzer />
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Reveal>
          <h2 className="mb-10 text-center font-display text-2xl font-bold sm:text-3xl">
            Почему именно «Выпендрёж»
          </h2>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 0.08}>
              <Card className="h-full">
                <CardContent className="flex flex-col gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <feature.icon className="size-5" />
                  </span>
                  <h3 className="font-display text-base font-bold">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{feature.text}</p>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Reveal>
          <div className="mb-8 flex flex-col items-center gap-2 text-center">
            <h2 className="font-display text-2xl font-bold sm:text-3xl">
              Вот как это выглядит
            </h2>
            <p className="max-w-lg text-sm text-muted-foreground">
              Настоящее игровое поле из демо-пакета «Выпендрёж 101». Пять категорий,
              двадцать пять вопросов, один повод для гордости или позора.
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <Card className="p-3 sm:p-5">
            <CardContent className="px-0">
              <BoardPreview categories={demoPack.categories} />
            </CardContent>
          </Card>
        </Reveal>
        <div className="mt-6 flex justify-center">
          <Button nativeButton={false} render={<Link href="/play/demo" />}>Попробовать вживую →</Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Reveal>
          <div className="mb-8 flex flex-col items-center gap-2 text-center">
            <h2 className="font-display text-2xl font-bold sm:text-3xl">
              Зал Позора ждёт новых героев
            </h2>
            <p className="max-w-lg text-sm text-muted-foreground">
              Лучшие (то есть худшие) ответы сообщества. Однажды здесь может
              оказаться и твой.
            </p>
          </div>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2">
          {hallOfShame.slice(0, 2).map((entry, i) => (
            <Reveal key={entry.id} delay={i * 0.1}>
              <ShameCard entry={entry} />
            </Reveal>
          ))}
        </div>
        <div className="mt-6 flex justify-center">
          <Button variant="outline" nativeButton={false} render={<Link href="/hall-of-shame" />}>
            Весь Зал Позора →
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Reveal>
          <Card className="glow-primary overflow-hidden bg-gradient-to-br from-primary/15 via-card to-secondary/15">
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <h2 className="font-display text-2xl font-bold sm:text-3xl">
                Готов выпендриться?
              </h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Регистрация занимает меньше времени, чем ты будешь придумывать
                название своей команде.
              </p>
              <Button
                size="lg"
                className="h-11 px-8 text-base"
                nativeButton={false}
                render={<Link href="/register" />}
              >
                Зарегистрироваться
              </Button>
            </CardContent>
          </Card>
        </Reveal>
      </section>
    </div>
  );
}
