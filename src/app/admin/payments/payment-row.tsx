"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/room-labels";
import { refundOrderAction } from "./actions";

const TYPE_LABELS: Record<string, string> = { BOOKING: "Бронирование", CERTIFICATE: "Сертификат", RECORDING: "Видео" };
const STATUS_LABELS: Record<string, string> = { PENDING: "Ожидает", PAID: "Оплачен", CANCELLED: "Отменён", REFUNDED: "Возврат" };

export function PaymentRow({
  order,
}: {
  order: { id: string; type: string; status: string; amount: number; customer: string; date: string; provider: string | null };
}) {
  const [isPending, startTransition] = useTransition();

  function handleRefund() {
    startTransition(async () => {
      const result = await refundOrderAction(order.id);
      if (result?.error) toast.error(result.error);
      else toast.success(result?.success ?? "Готово");
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">
          {TYPE_LABELS[order.type] ?? order.type} · {order.customer}
        </p>
        <p className="text-sm text-muted-foreground">
          {order.date} · {formatPrice(order.amount)} {order.provider ? `· ${order.provider}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={order.status === "PAID" ? "default" : "outline"}>{STATUS_LABELS[order.status] ?? order.status}</Badge>
        {order.status === "PAID" && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={handleRefund}>
            Вернуть деньги
          </Button>
        )}
      </div>
    </div>
  );
}
