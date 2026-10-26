import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GENRE_LABELS, DIFFICULTY_LABELS, formatPlayers, formatPrice } from "@/lib/room-labels";
import type { RoomModel } from "../../../generated/models";

export function QuestCard({ quest }: { quest: RoomModel }) {
  return (
    <Link href={`/quests/${quest.slug}`}>
      <Card className="group h-full overflow-hidden transition-shadow hover:shadow-lg">
        <div className="relative aspect-[16/10] bg-gradient-to-br from-primary/25 via-primary/10 to-muted" />
        <CardContent className="space-y-2 pt-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{GENRE_LABELS[quest.genre]}</Badge>
            <Badge variant="outline">{DIFFICULTY_LABELS[quest.difficulty]}</Badge>
          </div>
          <h3 className="font-heading text-lg font-semibold group-hover:text-primary">{quest.title}</h3>
          <p className="text-sm text-muted-foreground">
            {formatPlayers(quest.minPlayers, quest.maxPlayers)} · {quest.durationMinutes} минут · {quest.ageLimit}+
          </p>
          <p className="pt-1 text-sm font-medium">от {formatPrice(quest.basePrice)}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
