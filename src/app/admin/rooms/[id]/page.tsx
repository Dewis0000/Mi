import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { RoomForm } from "../room-form";
import { GenerateSlotsButton } from "./generate-slots-button";

export const dynamic = "force-dynamic";

export default async function EditRoomPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;

  const [room, locations] = await Promise.all([
    prisma.room.findUnique({ where: { id } }),
    prisma.location.findMany({ select: { id: true, name: true } }),
  ]);
  if (!room) notFound();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{room.title}</h1>
        <GenerateSlotsButton roomId={room.id} />
      </div>
      <div className="mt-6">
        <RoomForm room={room} locations={locations} />
      </div>
    </div>
  );
}
