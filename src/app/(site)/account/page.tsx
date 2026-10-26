import Link from "next/link";
import { Coins, Ticket, ArrowRight, AlertCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { getUserTier } from "@/lib/loyalty";
import { isPendingPhone } from "@/lib/phone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Личный кабинет" };
export const dynamic = "force-dynamic";

const TIER_NAMES: Record<string, string> = { BASE: "Базовый", SILVER: "Серебро", GOLD: "Золото", VIP: "VIP" };

export default async function AccountOverviewPage() {
  const user = await requireUser();

  const visits = await prisma.booking.count({ where: { userId: user.id, status: "COMPLETED" } });
  const tier = await getUserTier(visits);

  const upcoming = await prisma.booking.findFirst({
    where: { userId: user.id, status: { in: ["CONFIRMED", "CHECKED_IN"] }, slot: { startsAt: { gt: new Date() } } },
    include: { slot: { include: { room: true } } },
    orderBy: { slot: { startsAt: "asc" } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Здравствуйте, {user.name.split(" ")[0]}!</h1>
        <p className="text-muted-foreground">Ваш личный кабинет «Лабиринт»</p>
      </div>

      {isPendingPhone(user.phone) && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <AlertCircle className="size-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">Подтвердите номер телефона</p>
            <p className="mt-1 text-muted-foreground">
              Он нужен для бронирований и напоминаний.{" "}
              <Link href="/account/profile" className="underline underline-offset-4">
                Указать телефон
              </Link>
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-medium text-muted-foreground">Баллы</CardTitle>
            <Coins className="size-5 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{user.pointsBalance}</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline">{tier ? TIER_NAMES[tier.level] : "Базовый"}</Badge>
              <span className="text-xs text-muted-foreground">{visits} визитов</span>
            </div>
            <Link href="/account/points" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
              История баллов <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-medium text-muted-foreground">Ближайшая игра</CardTitle>
            <Ticket className="size-5 text-primary" />
          </CardHeader>
          <CardContent>
            {upcoming ? (
              <>
                <p className="font-semibold">{upcoming.slot.room.title}</p>
                <p className="text-sm text-muted-foreground">
                  {upcoming.slot.startsAt.toLocaleString("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Пока нет предстоящих бронирований</p>
            )}
            <Link href="/account/bookings" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
              Все бронирования <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <Button render={<Link href="/quests" />}>Забронировать новый квест</Button>
    </div>
  );
}
