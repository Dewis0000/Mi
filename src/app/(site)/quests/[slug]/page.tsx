import { notFound } from "next/navigation";
import { Star, Users, Clock, ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/db";
import { releaseExpiredHolds } from "@/lib/booking";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/motion/fade-in";
import { SlotPicker } from "@/components/quests/slot-picker";
import { QuestCard } from "@/components/quests/quest-card";
import { GENRE_LABELS, DIFFICULTY_LABELS, formatPlayers, formatPrice } from "@/lib/room-labels";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const room = await prisma.room.findUnique({ where: { slug } });
  return { title: room?.title ?? "Квест" };
}

export default async function QuestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const room = await prisma.room.findUnique({
    where: { slug },
    include: {
      reviews: { where: { isPublished: true }, orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!room || room.status !== "ACTIVE") notFound();

  await releaseExpiredHolds(room.id);

  const slots = await prisma.slot.findMany({
    where: { roomId: room.id, status: "OPEN", startsAt: { gt: new Date() } },
    orderBy: { startsAt: "asc" },
    take: 80,
  });

  const similar = await prisma.room.findMany({
    where: { status: "ACTIVE", id: { not: room.id } },
    take: 3,
  });

  const avgRating =
    room.reviews.length > 0 ? room.reviews.reduce((sum, r) => sum + r.rating, 0) / room.reviews.length : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FadeIn>
            <div className="aspect-[16/9] rounded-2xl bg-gradient-to-br from-primary/25 via-primary/10 to-muted" />
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{GENRE_LABELS[room.genre]}</Badge>
              <Badge variant="outline">{DIFFICULTY_LABELS[room.difficulty]}</Badge>
              <Badge variant="outline" className="gap-1">
                <ShieldAlert className="size-3.5" /> {room.ageLimit}+
              </Badge>
              {avgRating && (
                <Badge variant="outline" className="gap-1">
                  <Star className="size-3.5 fill-current text-amber-500" /> {avgRating.toFixed(1)}
                </Badge>
              )}
            </div>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{room.title}</h1>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Users className="size-4" /> {formatPlayers(room.minPlayers, room.maxPlayers)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="size-4" /> {room.durationMinutes} минут
              </span>
            </div>
            <p className="mt-6 max-w-2xl leading-relaxed text-foreground/90">{room.description}</p>
          </FadeIn>

          {room.reviews.length > 0 && (
            <div className="mt-12">
              <h2 className="text-xl font-semibold">Отзывы</h2>
              <div className="mt-4 space-y-4">
                {room.reviews.map((review) => (
                  <div key={review.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{review.authorName}</p>
                      <div className="flex items-center gap-1 text-amber-500">
                        {Array.from({ length: review.rating }).map((_, i) => (
                          <Star key={i} className="size-3.5 fill-current" />
                        ))}
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{review.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {similar.length > 0 && (
            <div className="mt-12">
              <h2 className="text-xl font-semibold">Похожие квесты</h2>
              <div className="mt-4 grid gap-6 sm:grid-cols-3">
                {similar.map((quest) => (
                  <QuestCard key={quest.id} quest={quest} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="sticky top-20 space-y-4">
            <div className="rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">Базовая цена</p>
              <p className="text-2xl font-semibold">{formatPrice(room.basePrice)}</p>
              {room.extraPlayerPrice > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  +{formatPrice(room.extraPlayerPrice)} за каждого игрока сверх {room.minPlayers}
                </p>
              )}
            </div>
            <SlotPicker
              slots={slots.map((s) => ({ id: s.id, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() }))}
              minPlayers={room.minPlayers}
              maxPlayers={room.maxPlayers}
              basePrice={room.basePrice}
              extraPlayerPrice={room.extraPlayerPrice}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
