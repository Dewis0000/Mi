"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/current-user";
import { getPaymentProvider } from "@/lib/payments";

export async function refundOrderAction(orderId: string) {
  const actor = await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true, booking: true } });
  if (!order || order.status !== "PAID") return { error: "Заказ недоступен для возврата" };

  const payment = order.payments.find((p) => p.status === "SUCCEEDED");
  if (!payment?.externalId) return { error: "Платёж не найден" };

  const provider = getPaymentProvider();
  let result;
  try {
    result = await provider.refundPayment(payment.externalId, order.amount);
  } catch (error) {
    console.error(error);
    return { error: "Провайдер не подтвердил возврат" };
  }
  if (result.status !== "SUCCEEDED") return { error: "Возврат не подтверждён провайдером" };

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
    await tx.receipt.create({ data: { paymentId: payment.id, type: "REFUND", amount: order.amount, externalId: result.externalId } });
    if (order.booking) {
      await tx.booking.update({ where: { id: order.booking.id }, data: { status: "REFUNDED" } });
      await tx.slot.update({ where: { id: order.booking.slotId }, data: { status: "OPEN", holdExpiresAt: null } });
    }
    await tx.auditLog.create({
      data: { actorId: actor.id, action: "order.refund", targetType: "Order", targetId: order.id, metadata: { amount: order.amount } },
    });
  });

  revalidatePath("/admin/payments");
  return { success: "Возврат оформлен, чек коррекции создан" };
}
