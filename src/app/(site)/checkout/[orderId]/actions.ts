"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getPaymentProvider } from "@/lib/payments";
import { finalizePaidOrder } from "@/lib/payments/finalize";
import { normalizePhone } from "@/lib/phone";
import type { ActionState } from "@/app/(auth)/actions";

export async function checkoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get("orderId") ?? "");
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { booking: { include: { slot: { include: { room: true } } } }, certificate: true },
  });

  if (!order) return { error: "Заказ не найден" };
  if (order.status !== "PENDING") return { error: "Этот заказ уже обработан" };

  const session = await auth();
  let amount = order.amount;
  let description = "Оплата на сайте";

  if (order.type === "BOOKING") {
    if (!order.booking) return { error: "Заказ не найден" };

    let guestName: string | undefined;
    let guestPhone: string | undefined;
    if (!order.userId) {
      guestName = String(formData.get("guestName") ?? "").trim();
      const normalized = normalizePhone(String(formData.get("guestPhone") ?? ""));
      if (!guestName || !normalized) {
        return { error: "Укажите имя и телефон для подтверждения брони" };
      }
      guestPhone = normalized;
    }
    const filmingConsent = formData.get("filmingConsent") === "on";

    const promoCodeInput = String(formData.get("promoCode") ?? "").trim().toUpperCase();
    const usePoints = formData.get("usePoints") === "on";
    let promoCodeId: string | undefined;
    let pointsToUse = 0;

    if (promoCodeInput) {
      const promo = await prisma.promoCode.findUnique({ where: { code: promoCodeInput } });
      if (!promo || !promo.isActive || (promo.maxUses != null && promo.usedCount >= promo.maxUses)) {
        return { error: "Промокод недействителен или уже использован" };
      }
      promoCodeId = promo.id;
      amount = promo.type === "PERCENT" ? Math.round(amount * (1 - promo.value / 100)) : Math.max(0, amount - promo.value);
    }

    if (usePoints && session?.user?.id) {
      const user = await prisma.user.findUnique({ where: { id: session.user.id } });
      if (user && user.pointsBalance > 0) {
        const maxRedeemable = Math.floor(amount * 0.5);
        pointsToUse = Math.min(user.pointsBalance, maxRedeemable);
        amount -= pointsToUse;
      }
    }

    // Фиксируем скидку/списание на заказе и брони ДО обращения к провайдеру — чтобы
    // вебхук реального провайдера мог довести дело до конца асинхронно.
    await prisma.booking.update({
      where: { id: order.booking.id },
      data: { guestName, guestPhone, promoCodeId, pointsUsed: pointsToUse, filmingConsent },
    });
    await prisma.order.update({ where: { id: order.id }, data: { amount } });
    description = `Бронирование «${order.booking.slot.room.title}», код ${order.booking.code}`;
  } else if (order.type === "CERTIFICATE" && order.certificate) {
    description = `Подарочный сертификат на ${order.certificate.amount} ₽`;
  } else if (order.type === "RECORDING") {
    description = "Покупка видеозаписи квеста";
  }

  const provider = getPaymentProvider();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let paymentResult;
  try {
    paymentResult = await provider.createPayment({
      orderId: order.id,
      amount,
      description,
      returnUrl: `${appUrl}/checkout/${order.id}`,
    });
  } catch (error) {
    console.error(error);
    return { error: "Платёжный провайдер временно недоступен, попробуйте позже" };
  }

  if (paymentResult.status === "PENDING" && paymentResult.redirectUrl) {
    redirect(paymentResult.redirectUrl);
  }
  if (paymentResult.status !== "SUCCEEDED") {
    return { error: "Не удалось провести оплату" };
  }

  await finalizePaidOrder(order.id, provider.name, paymentResult.externalId);
  redirect(`/checkout/${order.id}/success`);
}
