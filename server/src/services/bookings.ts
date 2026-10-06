import type { Booking, BookingSource, Quest, User } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, HttpError } from '../lib/http.js';
import { resolveSlots } from '../lib/slots.js';
import { notifyAdmins, notifyUser, templates } from './notify.js';
import { quote } from './pricing.js';
import { getSettings } from './settings.js';

/** Проверка количества и возраста игроков по ограничениям квеста */
export function validatePlayers(quest: Quest, playersCount: number, ages: number[], double: boolean) {
  if (playersCount < quest.minPlayers) {
    throw badRequest(`Минимум игроков для этого квеста — ${quest.minPlayers}`, 'PLAYERS_MIN');
  }
  if (playersCount > quest.maxPlayers) {
    if (!double) {
      throw badRequest(
        `Максимум игроков — ${quest.maxPlayers}. Можно арендовать два сеанса подряд.`,
        'PLAYERS_OVER_LIMIT',
        { maxPlayers: quest.maxPlayers, canDouble: playersCount <= quest.maxPlayers * 2 },
      );
    }
    if (playersCount > quest.maxPlayers * 2) {
      throw badRequest(`Даже на два сеанса — не более ${quest.maxPlayers * 2} игроков`, 'PLAYERS_DOUBLE_MAX');
    }
  } else if (double) {
    throw badRequest('Двойной сеанс доступен, только если игроков больше максимума', 'DOUBLE_NOT_NEEDED');
  }
  if (!ages.length) throw badRequest('Укажите возраст игроков', 'AGES_REQUIRED');
  const youngest = Math.min(...ages);
  if (youngest < quest.minAge) {
    throw badRequest(`Квест доступен с ${quest.minAge} лет`, 'AGE_RESTRICTED', { minAge: quest.minAge });
  }
}

export async function createBooking(opts: {
  user: User;
  quest: Quest;
  startAt: Date;
  playersCount: number;
  ages: number[];
  double: boolean;
  comment?: string | null;
  promoCode?: string | null;
  source?: BookingSource;
  /** администратор может ставить запись в любой слот, игнорируя запас времени */
  ignoreLead?: boolean;
  priceOverride?: { finalPrice?: number; discountPercent?: number };
}) {
  const { user, quest } = opts;
  validatePlayers(quest, opts.playersCount, opts.ages, opts.double);
  const slots = await resolveSlots(quest.id, opts.startAt, opts.double, { userId: user.id, ignoreLead: opts.ignoreLead });
  if (!slots) throw new HttpError(409, 'Это время уже занято. Выберите другой сеанс.', 'SLOT_TAKEN');

  const price = await quote({ quest, slotPrices: slots.map((s) => s.price), user, promoCode: opts.promoCode });
  const finalPrice = opts.priceOverride?.finalPrice ?? price.finalPrice;

  const booking = await prisma.$transaction(async (tx) => {
    // повторная проверка внутри транзакции — защита от гонки
    const clash = await tx.booking.count({
      where: {
        questId: quest.id,
        status: { in: ['NEW', 'CONFIRMED'] },
        startAt: { lt: slots[slots.length - 1].end },
        endAt: { gt: slots[0].start },
      },
    });
    if (clash) throw new HttpError(409, 'Это время только что заняли. Выберите другой сеанс.', 'SLOT_TAKEN');

    let second: Booking | null = null;
    if (slots[1]) {
      second = await tx.booking.create({
        data: {
          userId: user.id,
          questId: quest.id,
          startAt: slots[1].start,
          endAt: slots[1].end,
          playersCount: opts.playersCount,
          ages: opts.ages,
          basePrice: 0,
          finalPrice: 0,
          isDoubleSession: true,
          source: opts.source ?? 'WEB',
          comment: 'Второй сеанс двойной аренды',
        },
      });
    }
    const main = await tx.booking.create({
      data: {
        userId: user.id,
        questId: quest.id,
        startAt: slots[0].start,
        endAt: slots[0].end,
        playersCount: opts.playersCount,
        ages: opts.ages,
        basePrice: price.basePrice,
        discountPercent: opts.priceOverride?.discountPercent ?? price.discountPercent,
        discountAmount: price.basePrice - finalPrice,
        promoCode: price.promo?.code,
        finalPrice,
        comment: opts.comment || null,
        isDoubleSession: !!second,
        linkedBookingId: second?.id,
        source: opts.source ?? 'WEB',
      },
    });
    if (price.promo) {
      await tx.promoCode.updateMany({
        where: { code: price.promo.code, usesLeft: { not: null } },
        data: { usesLeft: { decrement: 1 } },
      });
    }
    await tx.slotHold.deleteMany({ where: { userId: user.id } });
    return main;
  });

  const info = { questTitle: quest.title, startAt: booking.startAt, playersCount: booking.playersCount, finalPrice: booking.finalPrice };
  if (user.notifyBookings) void notifyUser(user, templates.bookingCreated(info));
  void notifyAdmins(templates.adminNewBooking({ ...info, phone: user.phone, name: user.name }));
  return { booking, price };
}

/** Меняет статус записи вместе со связанным вторым сеансом и начисляет баллы при завершении */
export async function setBookingStatus(
  bookingId: string,
  status: Booking['status'],
  extra: { passed?: boolean | null; timeSpentMin?: number | null } = {},
) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { user: true, quest: true } });
  if (!booking) throw new HttpError(404, 'Запись не найдена');
  const settings = await getSettings();

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status, passed: extra.passed, timeSpentMin: extra.timeSpentMin },
    });
    if (booking.linkedBookingId) {
      await tx.booking.update({ where: { id: booking.linkedBookingId }, data: { status } });
    }
    if (status === 'COMPLETED' && !booking.pointsAwarded) {
      const points = settings.loyalty.pointsPerVisit;
      await tx.user.update({
        where: { id: booking.userId },
        data: { points: { increment: points }, lastVisitAt: booking.startAt > new Date() ? new Date() : booking.startAt },
      });
      await tx.pointsLog.create({
        data: { userId: booking.userId, delta: points, reason: 'VISIT', comment: `Квест «${booking.quest.title}»`, bookingId },
      });
      await tx.booking.update({ where: { id: bookingId }, data: { pointsAwarded: true } });
    }
  });

  const info = { questTitle: booking.quest.title, startAt: booking.startAt };
  if (booking.user.notifyBookings) {
    if (status === 'CONFIRMED' && booking.status !== 'CONFIRMED') void notifyUser(booking.user, templates.bookingConfirmed(info));
    if (status === 'CANCELLED' && booking.status !== 'CANCELLED') void notifyUser(booking.user, templates.bookingCancelled(info));
  }
  return prisma.booking.findUnique({ where: { id: bookingId } });
}

export const bookingInclude = {
  quest: { select: { id: true, slug: true, title: true, photoUrl: true, durationMin: true, roomNumber: true, fearLevel: true } },
  linkedBooking: { select: { id: true, startAt: true, endAt: true } },
} as const;
