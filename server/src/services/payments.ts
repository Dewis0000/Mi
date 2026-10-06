import type { PaymentPurpose } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { randomToken } from '../lib/crypto.js';
import { getSettings } from './settings.js';

/**
 * Платежи. Провайдер mock имитирует платёжную страницу (для разработки),
 * yookassa создаёт реальный платёж через API ЮKassa.
 */
export async function createPayment(opts: {
  userId: string;
  purpose: PaymentPurpose;
  entityId: string;
  amount: number;
  description: string;
  returnPath: string;
}) {
  const payment = await prisma.payment.create({
    data: {
      userId: opts.userId,
      purpose: opts.purpose,
      entityId: opts.entityId,
      amount: opts.amount,
      provider: config.PAYMENT_PROVIDER,
    },
  });

  if (config.PAYMENT_PROVIDER === 'yookassa') {
    const auth = Buffer.from(`${config.YOOKASSA_SHOP_ID}:${config.YOOKASSA_SECRET_KEY}`).toString('base64');
    const res = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Idempotence-Key': payment.id + randomToken(6),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: { value: opts.amount.toFixed(2), currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url: `${config.APP_URL}${opts.returnPath}?payment=${payment.id}` },
        description: opts.description,
        metadata: { paymentId: payment.id },
      }),
    });
    if (!res.ok) throw new Error(`YooKassa: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { id: string; confirmation: { confirmation_url: string } };
    await prisma.payment.update({ where: { id: payment.id }, data: { externalId: data.id } });
    return { paymentId: payment.id, confirmationUrl: data.confirmation.confirmation_url };
  }

  const q = new URLSearchParams({ id: payment.id, back: opts.returnPath });
  return { paymentId: payment.id, confirmationUrl: `${config.APP_URL}/payment/mock?${q}` };
}

/** Применяет успешную оплату к сущности */
export async function markPaid(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status === 'SUCCEEDED') return payment;
  const settings = await getSettings();
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: paymentId }, data: { status: 'SUCCEEDED', paidAt: new Date() } });
    if (payment.purpose === 'RECORDING') {
      await tx.recording.update({
        where: { id: payment.entityId },
        data: {
          isPurchased: true,
          purchasedAt: new Date(),
          expiresAt: new Date(Date.now() + settings.recordings.linkDays * 86_400_000),
        },
      });
    }
    if (payment.purpose === 'BOOKING_PREPAY') {
      await tx.booking.update({
        where: { id: payment.entityId },
        data: { prepaid: { increment: payment.amount }, status: 'CONFIRMED' },
      });
    }
  });
  return prisma.payment.findUnique({ where: { id: paymentId } });
}

/** Проверка статуса платежа в ЮKassa (вызывается из webhook) */
export async function verifyYookassaPayment(externalId: string) {
  const auth = Buffer.from(`${config.YOOKASSA_SHOP_ID}:${config.YOOKASSA_SECRET_KEY}`).toString('base64');
  const res = await fetch(`https://api.yookassa.ru/v3/payments/${externalId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as { id: string; status: string; metadata?: { paymentId?: string } };
}
