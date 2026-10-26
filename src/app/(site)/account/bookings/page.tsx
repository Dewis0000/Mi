import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { BookingRow } from "./booking-row";

export const metadata = { title: "Мои бронирования" };
export const dynamic = "force-dynamic";

export default async function AccountBookingsPage() {
  const user = await requireUser();

  const bookings = await prisma.booking.findMany({
    where: { userId: user.id },
    include: { slot: { include: { room: true } } },
    orderBy: { slot: { startsAt: "desc" } },
  });

  // eslint-disable-next-line react-hooks/purity -- серверный компонент, читает время один раз за запрос
  const now = Date.now();

  return (
    <div>
      <h1 className="text-2xl font-bold">Мои бронирования</h1>
      <div className="mt-6 space-y-3">
        {bookings.map((booking) => {
          const hoursUntil = (booking.slot.startsAt.getTime() - now) / 3_600_000;
          const canCancel = (booking.status === "CONFIRMED" || booking.status === "PENDING_PAYMENT") && hoursUntil >= 24;
          return (
            <BookingRow
              key={booking.id}
              booking={{
                id: booking.id,
                code: booking.code,
                status: booking.status,
                playersCount: booking.playersCount,
                priceTotal: booking.priceTotal,
                canCancel,
                roomTitle: booking.slot.room.title,
                startsAt: booking.slot.startsAt.toISOString(),
              }}
            />
          );
        })}
        {bookings.length === 0 && <p className="text-muted-foreground">У вас пока нет бронирований.</p>}
      </div>
    </div>
  );
}
