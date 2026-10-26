"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/room-labels";
import { cancelBookingAction } from "./actions";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  PENDING_PAYMENT: { label: "Ожидает оплаты", variant: "outline" },
  CONFIRMED: { label: "Подтверждено", variant: "default" },
  CHECKED_IN: { label: "Отметились", variant: "default" },
  IN_PROGRESS: { label: "Идёт игра", variant: "default" },
  COMPLETED: { label: "Завершено", variant: "secondary" },
  NO_SHOW: { label: "Не пришли", variant: "destructive" },
  CANCELLED: { label: "Отменено", variant: "outline" },
  REFUNDED: { label: "Возврат", variant: "outline" },
};

export function BookingRow({
  booking,
}: {
  booking: {
    id: string;
    code: string;
    status: string;
    playersCount: number;
    priceTotal: number;
    canCancel: boolean;
    roomTitle: string;
    startsAt: string;
  };
}) {
  const [isPending, startTransition] = useTransition();
  const status = STATUS_LABELS[booking.status] ?? { label: booking.status, variant: "outline" as const };

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelBookingAction(booking.id);
      if (result?.error) toast.error(result.error);
      else toast.success("Бронирование отменено");
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">{booking.roomTitle}</p>
        <p className="text-sm text-muted-foreground">
          {new Date(booking.startsAt).toLocaleString("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}
          {" · "}
          {booking.playersCount} игроков · {formatPrice(booking.priceTotal)} · код {booking.code}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={status.variant}>{status.label}</Badge>
        {booking.canCancel && (
          <Button variant="outline" size="sm" disabled={isPending} onClick={handleCancel}>
            Отменить
          </Button>
        )}
      </div>
    </div>
  );
}
