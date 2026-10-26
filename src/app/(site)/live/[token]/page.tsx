import { Radio } from "lucide-react";
import { prisma } from "@/lib/db";
import { LivePlayer } from "@/components/live/live-player";

export const metadata = { title: "Прямой эфир" };
export const dynamic = "force-dynamic";

export default async function PublicLivePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const liveSession = await prisma.liveSession.findUnique({
    where: { viewerToken: token },
    include: { camera: { include: { room: true } }, booking: true },
  });

  const isActive = liveSession && liveSession.status !== "ENDED" && liveSession.booking.status !== "CANCELLED";

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="flex items-center justify-center gap-2 text-center text-2xl font-bold">
        <Radio className="size-6 text-live" /> Прямой эфир
      </h1>

      {!isActive ? (
        <p className="mt-6 text-center text-muted-foreground">
          Эфир по этой ссылке недоступен — возможно, игра уже закончилась или ссылка устарела.
        </p>
      ) : (
        <div className="mt-6">
          <p className="text-center font-medium">{liveSession.camera.room.title}</p>
          <div className="mt-4">
            <LivePlayer hlsUrl={liveSession.camera.hlsUrl} />
          </div>
        </div>
      )}
    </div>
  );
}
