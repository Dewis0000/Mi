import { Radio, Share2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { LivePlayer } from "@/components/live/live-player";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Прямой эфир" };
export const dynamic = "force-dynamic";

export default async function AccountLivePage() {
  const user = await requireUser();
  const now = new Date();

  const activeBooking = await prisma.booking.findFirst({
    where: {
      userId: user.id,
      status: { in: ["CHECKED_IN", "IN_PROGRESS", "CONFIRMED"] },
      slot: { startsAt: { lte: new Date(now.getTime() + 10 * 60_000) }, endsAt: { gte: now } },
    },
    include: { slot: { include: { room: true } }, liveSession: { include: { camera: true } } },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Radio className="size-6 text-live" /> Прямой эфир
      </h1>

      {!activeBooking ? (
        <p className="mt-6 text-muted-foreground">
          Эфир появляется здесь во время вашей активной сессии в квесте. Сейчас активных бронирований нет.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          <div>
            <p className="font-medium">{activeBooking.slot.room.title}</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="outline" className="border-live/30 text-live">
                {activeBooking.liveSession?.status === "LIVE" ? "В эфире" : "Ожидание старта"}
              </Badge>
            </div>
          </div>

          <LivePlayer hlsUrl={activeBooking.liveSession?.camera.hlsUrl ?? null} />

          {activeBooking.liveSession && (
            <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <Share2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">Ссылка для близких:</span>
              <code className="truncate rounded bg-muted px-2 py-0.5 text-xs">
                {appUrl}/live/{activeBooking.liveSession.viewerToken}
              </code>
            </div>
          )}
          {!activeBooking.liveSession && (
            <p className="text-sm text-muted-foreground">
              Администратор включит трансляцию перед началом игры.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
