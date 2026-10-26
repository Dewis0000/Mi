import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { RoomForm } from "../room-form";

export const metadata = { title: "Новый квест" };
export const dynamic = "force-dynamic";

export default async function NewRoomPage() {
  await requireManager();
  const locations = await prisma.location.findMany({ select: { id: true, name: true } });

  return (
    <div>
      <h1 className="text-2xl font-bold">Новый квест</h1>
      <div className="mt-6">
        <RoomForm locations={locations} />
      </div>
    </div>
  );
}
