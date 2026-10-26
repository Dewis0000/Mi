import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { VideoCard } from "./video-card";

export const metadata = { title: "Мои видео" };
export const dynamic = "force-dynamic";

export default async function AccountVideosPage() {
  const user = await requireUser();

  const recordings = await prisma.recording.findMany({
    where: { booking: { userId: user.id } },
    include: { booking: { include: { slot: { include: { room: true } } } }, purchase: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Мои видео</h1>
      <p className="mt-2 text-muted-foreground">
        Запись появляется здесь после прохождения квеста, если вы согласились на видеосъёмку при
        бронировании.
      </p>

      <div className="mt-6 space-y-3">
        {recordings.map((rec) => (
          <VideoCard
            key={rec.id}
            recording={{
              id: rec.id,
              roomTitle: rec.booking.slot.room.title,
              date: rec.booking.slot.startsAt.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" }),
              status: rec.status,
              price: rec.price,
              purchased: Boolean(rec.purchase),
            }}
          />
        ))}
        {recordings.length === 0 && <p className="text-muted-foreground">Записей пока нет.</p>}
      </div>
    </div>
  );
}
