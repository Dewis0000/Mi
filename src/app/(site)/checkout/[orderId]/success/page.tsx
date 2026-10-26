import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Оплата прошла успешно" };
export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { booking: { include: { slot: { include: { room: true } } } }, certificate: true },
  });

  if (!order || order.status !== "PAID") notFound();

  let heading = "Оплата прошла успешно";
  let details: React.ReactNode = null;

  if (order.type === "BOOKING" && order.booking) {
    const dateLabel = order.booking.slot.startsAt.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    heading = "Бронирование подтверждено!";
    details = (
      <>
        <p className="mt-2 text-muted-foreground">
          «{order.booking.slot.room.title}» — {dateLabel}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Код бронирования: <span className="font-mono font-medium">{order.booking.code}</span>
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Подтверждение и напоминание придут по телефону, указанному при бронировании. Приезжайте на
          квест за 15 минут до начала.
        </p>
      </>
    );
  } else if (order.type === "CERTIFICATE" && order.certificate) {
    heading = "Сертификат оплачен!";
    details = (
      <p className="mt-2 text-muted-foreground">
        Код сертификата: <span className="font-mono font-medium">{order.certificate.code}</span> — он
        также придёт на указанный email.
      </p>
    );
  } else if (order.type === "RECORDING") {
    heading = "Видео куплено!";
    details = <p className="mt-2 text-muted-foreground">Запись доступна в разделе «Мои видео» личного кабинета.</p>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <CheckCircle2 className="mx-auto size-14 text-success" />
      <h1 className="mt-4 text-2xl font-bold">{heading}</h1>
      {details}
      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button render={<Link href="/account" />}>Личный кабинет</Button>
        <Button variant="outline" render={<Link href="/quests" />}>
          Выбрать ещё квест
        </Button>
      </div>
    </div>
  );
}
