"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { markRecordingReadyAction, revokeRecordingAccessAction, updateRecordingPriceAction } from "./actions";

const STATUS_LABELS: Record<string, string> = { PROCESSING: "Готовится", READY: "Готова", DELETED: "Удалена" };

export function VideoAdminRow({
  recording,
}: {
  recording: {
    id: string;
    roomTitle: string;
    date: string;
    status: string;
    price: number;
    purchased: boolean;
    customer: string;
  };
}) {
  const [isPending, startTransition] = useTransition();

  function handleReady() {
    startTransition(async () => {
      await markRecordingReadyAction(recording.id);
      toast.success("Запись отмечена готовой");
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      await revokeRecordingAccessAction(recording.id);
      toast.success("Доступ отозван");
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">
          {recording.roomTitle} · {recording.customer}
        </p>
        <p className="text-sm text-muted-foreground">{recording.date}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form action={updateRecordingPriceAction} className="flex items-center gap-1">
          <input type="hidden" name="id" value={recording.id} />
          <Input name="price" type="number" defaultValue={recording.price} className="w-20" />
          <Button type="submit" size="sm" variant="ghost">
            ₽
          </Button>
        </form>
        <Badge variant={recording.status === "READY" ? "default" : "outline"}>{STATUS_LABELS[recording.status]}</Badge>
        {recording.purchased && <Badge variant="secondary">Куплено</Badge>}
        {recording.status === "PROCESSING" && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={handleReady}>
            Готово
          </Button>
        )}
        {recording.purchased && (
          <Button size="sm" variant="ghost" disabled={isPending} onClick={handleRevoke}>
            Отозвать доступ
          </Button>
        )}
      </div>
    </div>
  );
}
