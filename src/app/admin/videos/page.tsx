import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { VideoAdminRow } from "./video-admin-row";

export const metadata = { title: "Видео и продажи" };
export const dynamic = "force-dynamic";

export default async function AdminVideosPage() {
  await requireManager();
  const recordings = await prisma.recording.findMany({
    include: { booking: { include: { slot: { include: { room: true } }, user: true } }, purchase: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Видео и продажи</h1>
      <p className="mt-1 text-muted-foreground">
        Записи создаются автоматически при завершении визита (если клиент согласился на съёмку).
      </p>

      <div className="mt-6 space-y-3">
        {recordings.map((rec) => (
          <VideoAdminRow
            key={rec.id}
            recording={{
              id: rec.id,
              roomTitle: rec.booking.slot.room.title,
              customer: rec.booking.user?.name ?? rec.booking.guestName ?? "Гость",
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
