import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/current-user";
import { PaymentRow } from "./payment-row";

export const metadata = { title: "Платежи и чеки" };
export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const orders = await prisma.order.findMany({
    include: { user: true, payments: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Платежи и чеки</h1>
      <p className="mt-1 text-muted-foreground">Возврат создаёт чек коррекции (54-ФЗ) и, для бронирований, освобождает слот.</p>

      <div className="mt-6 space-y-3">
        {orders.map((order) => (
          <PaymentRow
            key={order.id}
            order={{
              id: order.id,
              type: order.type,
              status: order.status,
              amount: order.amount,
              customer: order.user?.name ?? "Гость",
              date: order.createdAt.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" }),
              provider: order.payments[0]?.provider ?? null,
            }}
          />
        ))}
        {orders.length === 0 && <p className="text-muted-foreground">Платежей пока нет.</p>}
      </div>
    </div>
  );
}
