import { ThumbsDown } from "lucide-react";
import type { ShameEntry } from "@/lib/demo-data";
import { Card, CardContent } from "@/components/ui/card";

export function ShameCard({ entry, rank }: { entry: ShameEntry; rank?: number }) {
  return (
    <Card className="relative">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {rank && (
            <span className="font-display text-2xl font-extrabold text-muted-foreground/40">
              #{rank}
            </span>
          )}
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-lg">
            {entry.avatar}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{entry.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              Вопрос: {entry.question}
            </span>
          </div>
        </div>
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-foreground">
          «{entry.wrongAnswer}»
        </p>
        <div className="flex items-center gap-1.5 self-end text-xs text-muted-foreground">
          <ThumbsDown className="size-3.5" />
          {entry.votes} сочувствующих
        </div>
      </CardContent>
    </Card>
  );
}
