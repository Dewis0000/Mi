import { prisma } from "@/lib/db";
import type { PaymentProviderName } from "../../../generated/enums";

// Общая финализация оплаченного заказа (бронирование / сертификат / видео) —
// используется и синхронным (mock) путём оплаты, и вебхуком реального провайдера.
// Идемпотентна: повторный вызов для уже оплаченного заказа ничего не делает.
export async function finalizePaidOrder(orderId: string, providerName: PaymentProviderName, externalId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { booking: true } });
  if (!order || order.status === "PAID") return;

  const booking = order.type === "BOOKING" ? order.booking : null;

  await prisma.$transaction(async (tx) => {
    if (booking) {
      await tx.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED" } });
      await tx.slot.update({ where: { id: booking.slotId }, data: { status: "BOOKED", holdExpiresAt: null } });
    }
    await tx.order.update({ where: { id: order.id }, data: { status: "PAID" } });

    const payment = await tx.payment.create({
      data: { orderId: order.id, provider: providerName, externalId, status: "SUCCEEDED", amount: order.amount },
    });
    await tx.receipt.create({ data: { paymentId: payment.id, type: "SALE", amount: order.amount } });

    if (booking?.promoCodeId) {
      await tx.promoCode.update({ where: { id: booking.promoCodeId }, data: { usedCount: { increment: 1 } } });
    }
    if (booking && booking.pointsUsed > 0 && order.userId) {
      const user = await tx.user.update({
        where: { id: order.userId },
        data: { pointsBalance: { decrement: booking.pointsUsed } },
      });
      await tx.pointsTransaction.create({
        data: {
          userId: order.userId,
          type: "REDEMPTION",
          amount: -booking.pointsUsed,
          balanceAfter: user.pointsBalance,
          bookingId: booking.id,
          note: "Списание баллов при оплате бронирования",
        },
      });
    }
  });
}
