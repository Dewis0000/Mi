"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/room-labels";
import { createRecordingOrderAction } from "./actions";

export function VideoCard({
  recording,
}: {
  recording: { id: string; roomTitle: string; date: string; status: string; price: number; purchased: boolean };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleBuy() {
    startTransition(async () => {
      const result = await createRecordingOrderAction(recording.id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      if (result?.orderId) router.push(`/checkout/${result.orderId}`);
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
      <div>
        <p className="font-medium">{recording.roomTitle}</p>
        <p className="text-sm text-muted-foreground">{recording.date}</p>
      </div>
      {recording.status !== "READY" ? (
        <Badge variant="outline">Готовится</Badge>
      ) : recording.purchased ? (
        <Button size="sm" variant="outline" disabled>
          <Play className="size-3.5" /> Куплено
        </Button>
      ) : (
        <Button size="sm" disabled={isPending} onClick={handleBuy}>
          <Lock className="size-3.5" /> Купить за {formatPrice(recording.price)}
        </Button>
      )}
    </div>
  );
}
