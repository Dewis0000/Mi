import type { Quest, User } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest } from '../lib/http.js';
import { tierFor } from '../lib/loyalty.js';
import { getSettings } from './settings.js';

const MAX_PERCENT = 50;

export async function findPromo(code?: string | null) {
  if (!code) return null;
  const promo = await prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!promo || !promo.isActive) throw badRequest('Промокод не найден', 'PROMO_INVALID');
  if (promo.validTo && promo.validTo < new Date()) throw badRequest('Срок действия промокода истёк', 'PROMO_EXPIRED');
  if (promo.usesLeft !== null && promo.usesLeft <= 0) throw badRequest('Промокод уже использован', 'PROMO_USED');
  return promo;
}

/** Расчёт стоимости: цена слотов − скидка по баллам − промокод/сертификат */
export async function quote(opts: { quest: Quest; slotPrices: number[]; user: User | null; promoCode?: string | null }) {
  const settings = await getSettings();
  const basePrice = opts.slotPrices.reduce((a, b) => a + b, 0);
  const loyaltyPercent = opts.user ? tierFor(opts.user.points, settings.loyalty).percent : 0;
  const promo = await findPromo(opts.promoCode);
  const percent = Math.min(MAX_PERCENT, loyaltyPercent + (promo?.discountPercent ?? 0));
  const percentAmount = Math.round((basePrice * percent) / 100);
  const fixed = promo?.discountAmount ?? 0;
  const discountAmount = Math.min(basePrice, percentAmount + fixed);
  const finalPrice = basePrice - discountAmount;
  const prepay =
    settings.booking.prepayMode === 'prepay' ? Math.round((finalPrice * settings.booking.prepayPercent) / 100) : 0;
  return {
    basePrice,
    loyaltyPercent,
    promo: promo
      ? { code: promo.code, isCertificate: promo.isCertificate, percent: promo.discountPercent, amount: promo.discountAmount }
      : null,
    discountPercent: percent,
    discountAmount,
    finalPrice,
    prepay,
  };
}
