"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { updateCameraAction } from "./actions";

const STATUS_LABELS = { ONLINE: "В сети", OFFLINE: "Не в сети", MAINTENANCE: "Обслуживание" };

export function CameraRow({
  camera,
}: {
  camera: { id: string; label: string; status: string; rtspUrl: string | null; hlsUrl: string | null; roomTitle: string };
}) {
  return (
    <form action={updateCameraAction} className="space-y-3 rounded-lg border p-4">
      <input type="hidden" name="id" value={camera.id} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{camera.roomTitle}</p>
        <Badge variant={camera.status === "ONLINE" ? "default" : "outline"}>
          {STATUS_LABELS[camera.status as keyof typeof STATUS_LABELS] ?? camera.status}
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Название камеры</Label>
          <Input name="label" defaultValue={camera.label} />
        </div>
        <div className="space-y-1.5">
          <Label>Статус</Label>
          <Select name="status" defaultValue={camera.status}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>RTSP (внутренний адрес медиасервера)</Label>
          <Input name="rtspUrl" defaultValue={camera.rtspUrl ?? ""} placeholder="rtsp://..." />
        </div>
        <div className="space-y-1.5">
          <Label>HLS (публичный плейлист для сайта)</Label>
          <Input name="hlsUrl" defaultValue={camera.hlsUrl ?? ""} placeholder="https://.../index.m3u8" />
        </div>
      </div>
      <Button type="submit" size="sm">
        Сохранить
      </Button>
    </form>
  );
}
