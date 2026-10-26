import Link from "next/link";
import { CalendarCheck, Users, Wallet, DoorOpen } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/room-labels";

export const metadata = { title: "Админ-панель" };
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireManager();

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  const [todaySessions, todayRevenue, activeRooms, totalUsers] = await Promise.all([
    prisma.booking.findMany({
      where: { slot: { startsAt: { gte: dayStart, lte: dayEnd } }, status: { in: ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"] } },
      include: { slot: { include: { room: true } } },
      orderBy: { slot: { startsAt: "asc" } },
    }),
    prisma.order.aggregate({ where: { status: "PAID", createdAt: { gte: dayStart, lte: dayEnd } }, _sum: { amount: true } }),
    prisma.room.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
  ]);

  const stats = [
    { label: "Сессий сегодня", value: todaySessions.length, icon: CalendarCheck },
    { label: "Выручка сегодня", value: formatPrice(todayRevenue._sum.amount ?? 0), icon: Wallet },
    { label: "Активных квестов", value: activeRooms, icon: DoorOpen },
    { label: "Зарегистрированных клиентов", value: totalUsers, icon: Users },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">Дашборд</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className="size-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-semibold">Сессии на сегодня</h2>
      <div className="mt-3 space-y-2">
        {todaySessions.map((booking) => (
          <Link
            key={booking.id}
            href={`/admin/bookings?search=${booking.code}`}
            className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-accent"
          >
            <span>
              {booking.slot.startsAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} ·{" "}
              {booking.slot.room.title} · {booking.playersCount} игроков
            </span>
            <Badge variant="outline">{booking.status}</Badge>
          </Link>
        ))}
        {todaySessions.length === 0 && <p className="text-muted-foreground">На сегодня подтверждённых сессий нет.</p>}
      </div>
    </div>
  );
}
