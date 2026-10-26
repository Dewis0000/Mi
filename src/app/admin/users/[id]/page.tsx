import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PointsForm } from "./points-form";
import { AnonymizeButton } from "./anonymize-button";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireManager();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      bookings: { include: { slot: { include: { room: true } } }, orderBy: { createdAt: "desc" }, take: 10 },
      pointsTransactions: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!user) notFound();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{user.name}</h1>
          <p className="text-muted-foreground">
            {user.phone} {user.email ? `· ${user.email}` : ""} · <Badge variant="outline">{user.role}</Badge>
          </p>
        </div>
        <Button variant="outline" render={<Link href={`/admin/users/${user.id}/export`} />}>
          <Download className="size-4" /> Экспорт данных
        </Button>
      </div>

      <div className="mt-6 rounded-xl border p-5">
        <p className="text-sm text-muted-foreground">Баланс баллов</p>
        <p className="text-2xl font-bold">{user.pointsBalance}</p>
        {actor.role === "ADMIN" && (
          <div className="mt-3">
            <PointsForm userId={user.id} />
          </div>
        )}
      </div>

      <h2 className="mt-8 text-lg font-semibold">Последние бронирования</h2>
      <div className="mt-3 space-y-2">
        {user.bookings.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <span>
              {b.slot.room.title} · {b.slot.startsAt.toLocaleDateString("ru-RU")}
            </span>
            <Badge variant="outline">{b.status}</Badge>
          </div>
        ))}
        {user.bookings.length === 0 && <p className="text-sm text-muted-foreground">Бронирований нет.</p>}
      </div>

      <h2 className="mt-8 text-lg font-semibold">История баллов</h2>
      <div className="mt-3 space-y-2">
        {user.pointsTransactions.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <span>
              {tx.type} {tx.note ? `· ${tx.note}` : ""}
            </span>
            <span className={tx.amount >= 0 ? "text-success" : "text-destructive"}>
              {tx.amount >= 0 ? "+" : ""}
              {tx.amount}
            </span>
          </div>
        ))}
        {user.pointsTransactions.length === 0 && <p className="text-sm text-muted-foreground">Операций нет.</p>}
      </div>

      {actor.role === "ADMIN" && (
        <div className="mt-8 rounded-xl border border-destructive/30 p-5">
          <h2 className="text-lg font-semibold">Удаление персональных данных (152-ФЗ)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Имя, email, телефон будут заменены на анонимные значения. История бронирований и платежей
            сохранится для бухгалтерской отчётности, но без привязки к личности.
          </p>
          <div className="mt-3">
            <AnonymizeButton userId={user.id} />
          </div>
        </div>
      )}
    </div>
  );
}
