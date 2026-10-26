import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { releaseExpiredHolds } from "@/lib/booking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/room-labels";
import { CheckoutForm } from "./checkout-form";

export const metadata = { title: "Оформление заказа" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { booking: { include: { slot: { include: { room: true } } } }, certificate: true },
  });
  if (!order) notFound();

  if (order.status === "PAID") {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-lg font-medium">Этот заказ уже оплачен.</p>
        <Link href="/account/payments" className="mt-4 inline-block text-primary underline-offset-4 hover:underline">
          Перейти к моим платежам
        </Link>
      </div>
    );
  }

  let title = "Оплата заказа";
  let summary: React.ReactNode = null;
  let needsGuestInfo = false;

  if (order.type === "BOOKING") {
    if (!order.booking) notFound();
    await releaseExpiredHolds(order.booking.slot.roomId);
    const refreshedBooking = await prisma.booking.findUnique({ where: { id: order.booking.id } });

    if (!refreshedBooking || refreshedBooking.status !== "PENDING_PAYMENT") {
      return (
        <div className="mx-auto max-w-lg px-4 py-20 text-center">
          <p className="text-lg font-medium">Время на оплату этого бронирования истекло.</p>
          <p className="mt-2 text-muted-foreground">Слот освободился — выберите время ещё раз.</p>
          <Link
            href={`/quests/${order.booking.slot.room.slug}`}
            className="mt-4 inline-block text-primary underline-offset-4 hover:underline"
          >
            Вернуться к квесту
          </Link>
        </div>
      );
    }

    title = "Оформление бронирования";
    needsGuestInfo = !order.userId;
    const dateLabel = order.booking.slot.startsAt.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    summary = (
      <>
        <CardTitle className="text-lg">{order.booking.slot.room.title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {dateLabel} · {order.booking.playersCount} игроков · код {order.booking.code}
        </p>
      </>
    );
  } else if (order.type === "CERTIFICATE" && order.certificate) {
    title = "Оплата сертификата";
    summary = (
      <>
        <CardTitle className="text-lg">Подарочный сертификат</CardTitle>
        <p className="text-sm text-muted-foreground">
          Код: {order.certificate.code}
          {order.certificate.recipientName && ` · для ${order.certificate.recipientName}`}
        </p>
      </>
    );
  } else if (order.type === "RECORDING") {
    title = "Покупка видеозаписи";
    summary = <CardTitle className="text-lg">Видеозапись квеста</CardTitle>;
  }

  const session = await auth();
  const user = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id } }) : null;
  const hasPoints = order.type === "BOOKING" && Boolean(user && user.pointsBalance > 0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold">{title}</h1>

      <Card className="mt-6">
        <CardHeader>{summary}</CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-muted-foreground">К оплате</span>
            <span className="text-xl font-semibold">{formatPrice(order.amount)}</span>
          </div>
          {hasPoints && <Badge variant="outline">У вас {user!.pointsBalance} баллов на счету</Badge>}
        </CardContent>
      </Card>

      <div className="mt-6">
        <CheckoutForm
          orderId={order.id}
          orderType={order.type}
          needsGuestInfo={needsGuestInfo}
          hasPoints={hasPoints}
        />
      </div>
    </div>
  );
}
