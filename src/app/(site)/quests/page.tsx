import { prisma } from "@/lib/db";
import { QuestCard } from "@/components/quests/quest-card";
import { FadeIn } from "@/components/motion/fade-in";
import { GENRE_LABELS, DIFFICULTY_LABELS } from "@/lib/room-labels";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { RoomGenre, RoomDifficulty } from "../../../../generated/enums";

export const metadata = { title: "Квесты" };
export const dynamic = "force-dynamic";

export default async function QuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string; difficulty?: string }>;
}) {
  const params = await searchParams;
  const genre = params.genre as RoomGenre | undefined;
  const difficulty = params.difficulty as RoomDifficulty | undefined;

  const quests = await prisma.room.findMany({
    where: {
      status: "ACTIVE",
      ...(genre ? { genre } : {}),
      ...(difficulty ? { difficulty } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  const genreEntries = Object.entries(GENRE_LABELS) as [RoomGenre, string][];
  const difficultyEntries = Object.entries(DIFFICULTY_LABELS) as [RoomDifficulty, string][];

  function buildHref(nextGenre?: string, nextDifficulty?: string) {
    const qs = new URLSearchParams();
    if (nextGenre) qs.set("genre", nextGenre);
    if (nextDifficulty) qs.set("difficulty", nextDifficulty);
    const query = qs.toString();
    return query ? `/quests?${query}` : "/quests";
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <FadeIn>
        <h1 className="text-3xl font-bold sm:text-4xl">Каталог квестов</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Живые квесты с актёрами и декорациями в полный рост. Выберите жанр и сложность — или смотрите все сразу.
        </p>
      </FadeIn>

      <div className="mt-6 flex flex-wrap gap-2">
        <FilterBadge href={buildHref(undefined, difficulty)} active={!genre} label="Все жанры" />
        {genreEntries.map(([value, label]) => (
          <FilterBadge key={value} href={buildHref(value, difficulty)} active={genre === value} label={label} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <FilterBadge href={buildHref(genre, undefined)} active={!difficulty} label="Любая сложность" />
        {difficultyEntries.map(([value, label]) => (
          <FilterBadge key={value} href={buildHref(genre, value)} active={difficulty === value} label={label} />
        ))}
      </div>

      {quests.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">
          По этим фильтрам квестов не нашлось. Попробуйте{" "}
          <Link href="/quests" className="underline underline-offset-4">
            сбросить фильтры
          </Link>
          .
        </p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {quests.map((quest) => (
            <QuestCard key={quest.id} quest={quest} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBadge({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href}>
      <Badge
        variant={active ? "default" : "outline"}
        className={cn("cursor-pointer", active && "pointer-events-none")}
      >
        {label}
      </Badge>
    </Link>
  );
}
