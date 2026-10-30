import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShameCard } from "@/components/shame-card";
import { MascotBubble } from "@/components/mascot-bubble";
import { hallOfShame } from "@/lib/demo-data";

export const metadata: Metadata = {
  title: "Зал Позора",
  description: "Лучшие (то есть худшие) неправильные ответы в истории «Выпендрёжа».",
};

export default function HallOfShamePage() {
  const ranked = [...hallOfShame].sort((a, b) => b.votes - a.votes);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-4xl">🏆</span>
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          Зал Позора
        </h1>
        <p className="max-w-lg text-sm text-muted-foreground">
          Сюда попадают не самые умные ответы, а самые запоминающиеся. Голосуйте
          сочувствием, не осуждением. Ладно, немного осуждением.
        </p>
      </div>

      <MascotBubble
        className="mx-auto"
        text="Каждый из этих людей был уверен в себе ровно до этого момента."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {ranked.map((entry, i) => (
          <ShameCard key={entry.id} entry={entry} rank={i + 1} />
        ))}
      </div>

      <div className="flex flex-col items-center gap-2 pt-4 text-center">
        <p className="text-sm text-muted-foreground">
          Думаешь, твой ответ был хуже? Есть только один способ проверить.
        </p>
        <Button nativeButton={false} render={<Link href="/play/demo" />}>Попробовать опозориться →</Button>
      </div>
    </div>
  );
}
