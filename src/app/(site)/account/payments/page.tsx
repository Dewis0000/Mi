import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { formatPrice } from "@/lib/room-labels";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Платежи и чеки" };
export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = { BOOKING: "Бронирование", CERTIFICATE: "Сертификат", RECORDING: "Видео" };
const STATUS_LABELS: Record<string, string> = { PENDING: "Ожидает оплаты", PAID: "Оплачен", CANCELLED: "Отменён", REFUNDED: "Возврат" };

export default async function AccountPaymentsPage() {
  const user = await requireUser();
  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    include: { payments: { include: { receipts: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Платежи и чеки</h1>
      <div className="mt-6 space-y-3">
        {orders.map((order) => (
          <div key={order.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{TYPE_LABELS[order.type] ?? order.type}</p>
                <p className="text-sm text-muted-foreground">
                  {order.createdAt.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })} ·{" "}
                  {formatPrice(order.amount)}
                </p>
              </div>
              <Badge variant={order.status === "PAID" ? "default" : "outline"}>{STATUS_LABELS[order.status]}</Badge>
            </div>
            {order.payments.map((payment) =>
              payment.receipts.map((receipt) => (
                <p key={receipt.id} className="mt-2 text-xs text-muted-foreground">
                  Чек от {receipt.createdAt.toLocaleDateString("ru-RU")} на {formatPrice(receipt.amount)}
                  {receipt.url && receipt.url !== "#" && (
                    <>
                      {" · "}
                      <a href={receipt.url} className="underline underline-offset-4" target="_blank" rel="noreferrer">
                        открыть чек
                      </a>
                    </>
                  )}
                </p>
              ))
            )}
          </div>
        ))}
        {orders.length === 0 && <p className="text-muted-foreground">Платежей пока нет.</p>}
      </div>
    </div>
  );
}
