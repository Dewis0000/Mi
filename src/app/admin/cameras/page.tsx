import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { CameraRow } from "./camera-row";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { addCameraAction } from "./actions";

export const metadata = { title: "Камеры" };
export const dynamic = "force-dynamic";

export default async function AdminCamerasPage() {
  await requireManager();
  const [cameras, rooms] = await Promise.all([
    prisma.camera.findMany({ include: { room: true }, orderBy: { createdAt: "asc" } }),
    prisma.room.findMany({ select: { id: true, title: true } }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Камеры</h1>
      <p className="mt-1 text-muted-foreground">
        Подключение к медиа-серверу (MediaMTX/go2rtc) настраивается здесь — см. docs/ARCHITECTURE.md, раздел 7.
      </p>

      <form action={addCameraAction} className="mt-6 flex flex-wrap items-end gap-2 rounded-lg border p-4">
        <div className="space-y-1.5">
          <label className="text-sm text-muted-foreground">Комната</label>
          <Select name="roomId">
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Выберите комнату" />
            </SelectTrigger>
            <SelectContent>
              {rooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm text-muted-foreground">Название</label>
          <Input name="label" placeholder="Например, «Вход»" className="w-48" />
        </div>
        <Button type="submit" variant="outline">
          Добавить камеру
        </Button>
      </form>

      <div className="mt-6 space-y-4">
        {cameras.map((camera) => (
          <CameraRow
            key={camera.id}
            camera={{
              id: camera.id,
              label: camera.label,
              status: camera.status,
              rtspUrl: camera.rtspUrl,
              hlsUrl: camera.hlsUrl,
              roomTitle: camera.room.title,
            }}
          />
        ))}
      </div>
    </div>
  );
}
