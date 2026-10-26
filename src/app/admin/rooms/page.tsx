import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GENRE_LABELS, formatPrice } from "@/lib/room-labels";

export const metadata = { title: "Квесты" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = { ACTIVE: "Активен", PAUSED: "На паузе", ARCHIVED: "Архив" };

export default async function AdminRoomsPage() {
  await requireManager();
  const rooms = await prisma.room.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { slots: true } } } });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Квесты</h1>
        <Button render={<Link href="/admin/rooms/new" />}>
          <Plus className="size-4" /> Новый квест
        </Button>
      </div>

      <div className="mt-6 space-y-3">
        {rooms.map((room) => (
          <Link key={room.id} href={`/admin/rooms/${room.id}`} className="flex items-center justify-between gap-3 rounded-lg border p-4 hover:bg-accent">
            <div>
              <p className="font-medium">{room.title}</p>
              <p className="text-sm text-muted-foreground">
                {GENRE_LABELS[room.genre]} · {formatPrice(room.basePrice)} · слотов: {room._count.slots}
              </p>
            </div>
            <Badge variant={room.status === "ACTIVE" ? "default" : "outline"}>{STATUS_LABELS[room.status]}</Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}
