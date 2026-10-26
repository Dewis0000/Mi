"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/room-labels";
import { adminCancelBookingAction } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Ожидает оплаты",
  CONFIRMED: "Подтверждено",
  CHECKED_IN: "Отметились",
  IN_PROGRESS: "Идёт игра",
  COMPLETED: "Завершено",
  NO_SHOW: "Не пришли",
  CANCELLED: "Отменено",
  REFUNDED: "Возврат",
};

export function BookingAdminRow({
  booking,
}: {
  booking: {
    id: string;
    code: string;
    status: string;
    roomTitle: string;
    startsAt: string;
    playersCount: number;
    priceTotal: number;
    customer: string;
    phone: string;
  };
}) {
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    startTransition(async () => {
      const result = await adminCancelBookingAction(booking.id);
      if (result?.error) toast.error(result.error);
      else toast.success("Бронирование отменено");
    });
  }

  const canCancel = booking.status === "CONFIRMED" || booking.status === "PENDING_PAYMENT" || booking.status === "CHECKED_IN";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">{booking.roomTitle}</p>
        <p className="text-sm text-muted-foreground">
          {new Date(booking.startsAt).toLocaleString("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}
          {" · "}
          {booking.customer} · {booking.phone} · {booking.playersCount} игроков · {formatPrice(booking.priceTotal)} · код{" "}
          <span className="font-mono">{booking.code}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">{STATUS_LABELS[booking.status] ?? booking.status}</Badge>
        {canCancel && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={handleCancel}>
            Отменить
          </Button>
        )}
      </div>
    </div>
  );
}
