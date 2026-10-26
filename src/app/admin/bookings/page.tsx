import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BookingAdminRow } from "./booking-admin-row";
import type { BookingStatus } from "../../../../generated/enums";

export const metadata = { title: "Бронирования" };
export const dynamic = "force-dynamic";

const STATUSES: { value: BookingStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "Все" },
  { value: "PENDING_PAYMENT", label: "Ожидают оплаты" },
  { value: "CONFIRMED", label: "Подтверждены" },
  { value: "CHECKED_IN", label: "Отметились" },
  { value: "IN_PROGRESS", label: "Идёт игра" },
  { value: "COMPLETED", label: "Завершены" },
  { value: "NO_SHOW", label: "Неявки" },
  { value: "CANCELLED", label: "Отменены" },
];

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  await requireManager();
  const params = await searchParams;
  const status = params.status as BookingStatus | undefined;
  const search = params.search?.trim();

  const bookings = await prisma.booking.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search } },
              { guestPhone: { contains: search } },
              { user: { phone: { contains: search } } },
            ],
          }
        : {}),
    },
    include: { slot: { include: { room: true } }, user: true },
    orderBy: { slot: { startsAt: "desc" } },
    take: 100,
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Бронирования</h1>
        <Button render={<Link href="/admin/bookings/new" />}>
          <Plus className="size-4" /> Новое бронирование
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link key={s.value} href={s.value === "ALL" ? "/admin/bookings" : `/admin/bookings?status=${s.value}`}>
            <Badge
              variant={(s.value === "ALL" && !status) || status === s.value ? "default" : "outline"}
              className={cn("cursor-pointer", ((s.value === "ALL" && !status) || status === s.value) && "pointer-events-none")}
            >
              {s.label}
            </Badge>
          </Link>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {bookings.map((booking) => (
          <BookingAdminRow
            key={booking.id}
            booking={{
              id: booking.id,
              code: booking.code,
              status: booking.status,
              roomTitle: booking.slot.room.title,
              startsAt: booking.slot.startsAt.toISOString(),
              playersCount: booking.playersCount,
              priceTotal: booking.priceTotal,
              customer: booking.user?.name ?? booking.guestName ?? "Гость",
              phone: booking.user?.phone ?? booking.guestPhone ?? "—",
            }}
          />
        ))}
        {bookings.length === 0 && <p className="text-muted-foreground">Ничего не найдено.</p>}
      </div>
    </div>
  );
}
