import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, ah, badRequest, notFound, parse } from '../lib/http.js';
import { resolveSlots } from '../lib/slots.js';
import { requireAuth } from '../middleware/auth.js';
import { bookingInclude, createBooking, setBookingStatus, validatePlayers } from '../services/bookings.js';
import { createPayment } from '../services/payments.js';
import { quote } from '../services/pricing.js';
import { getSettings } from '../services/settings.js';

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

const slotBody = z.object({
  questId: z.string(),
  startAt: z.coerce.date(),
  double: z.boolean().default(false),
});

async function activeQuest(id: string) {
  const quest = await prisma.quest.findFirst({ where: { id, isActive: true } });
  if (!quest) throw notFound('Квест не найден');
  return quest;
}

/** Блокировка слота на время оформления заявки */
bookingsRouter.post(
  '/hold',
  ah(async (req, res) => {
    const body = parse(slotBody, req.body);
    await activeQuest(body.questId);
    const settings = await getSettings();
    await prisma.slotHold.deleteMany({ where: { userId: req.user!.id } });
    const slots = await resolveSlots(body.questId, body.startAt, body.double, { userId: req.user!.id });
    if (!slots) throw new HttpError(409, 'Этот сеанс уже заняли — выберите другое время', 'SLOT_TAKEN');
    const expiresAt = new Date(Date.now() + settings.booking.holdMinutes * 60_000);
    await prisma.slotHold.create({
      data: {
        questId: body.questId,
        userId: req.user!.id,
        startAt: slots[0].start,
        endAt: slots[slots.length - 1].end,
        expiresAt,
      },
    });
    res.json({ expiresAt, slots });
  }),
);

bookingsRouter.delete(
  '/hold',
  ah(async (req, res) => {
    await prisma.slotHold.deleteMany({ where: { userId: req.user!.id } });
    res.json({ ok: true });
  }),
);

bookingsRouter.post(
  '/quote',
  ah(async (req, res) => {
    const body = parse(slotBody.extend({ promoCode: z.string().optional() }), req.body);
    const quest = await activeQuest(body.questId);
    const slots = await resolveSlots(body.questId, body.startAt, body.double, { userId: req.user!.id });
    if (!slots) throw new HttpError(409, 'Этот сеанс уже заняли — выберите другое время', 'SLOT_TAKEN');
    res.json(await quote({ quest, slotPrices: slots.map((s) => s.price), user: req.user!, promoCode: body.promoCode }));
  }),
);

/** Проверка игроков (шаг 1 формы) — сервер подсказывает про двойной сеанс */
bookingsRouter.post(
  '/validate-players',
  ah(async (req, res) => {
    const body = parse(
      z.object({ questId: z.string(), playersCount: z.number().int().min(1).max(50), ages: z.array(z.number().int().min(1).max(120)), double: z.boolean().default(false) }),
      req.body,
    );
    validatePlayers(await activeQuest(body.questId), body.playersCount, body.ages, body.double);
    res.json({ ok: true });
  }),
);

bookingsRouter.post(
  '/',
  ah(async (req, res) => {
    const body = parse(
      slotBody.extend({
        playersCount: z.number().int().min(1).max(50),
        ages: z.array(z.number().int().min(1).max(120)).min(1).max(50),
        comment: z.string().max(1000).optional(),
        promoCode: z.string().max(40).optional(),
      }),
      req.body,
    );
    const quest = await activeQuest(body.questId);
    const { booking } = await createBooking({
      user: req.user!,
      quest,
      startAt: body.startAt,
      playersCount: body.playersCount,
      ages: body.ages,
      double: body.double,
      comment: body.comment,
      promoCode: body.promoCode,
    });
    const settings = await getSettings();
    let payment: { paymentId: string; confirmationUrl: string } | null = null;
    if (settings.booking.prepayMode === 'prepay' && booking.finalPrice > 0) {
      payment = await createPayment({
        userId: req.user!.id,
        purpose: 'BOOKING_PREPAY',
        entityId: booking.id,
        amount: Math.round((booking.finalPrice * settings.booking.prepayPercent) / 100),
        description: `Предоплата: «${quest.title}»`,
        returnPath: '/profile',
      });
    }
    res.status(201).json({ booking, payment });
  }),
);

bookingsRouter.get(
  '/my',
  ah(async (req, res) => {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user!.id, linkedFrom: { is: null } },
      include: bookingInclude,
      orderBy: { startAt: 'desc' },
    });
    const now = new Date();
    const settings = await getSettings();
    const active = bookings
      .filter((b) => ['NEW', 'CONFIRMED'].includes(b.status) && (b.linkedBooking?.endAt ?? b.endAt) > now)
      .reverse()
      .map((b) => ({
        ...b,
        canChange: b.startAt.getTime() - now.getTime() >= settings.booking.cancelHours * 3_600_000,
        isLive: b.startAt <= now && (b.linkedBooking?.endAt ?? b.endAt) > now,
      }));
    const history = bookings.filter((b) => !active.some((a) => a.id === b.id));
    res.json({ active, history, cancelHours: settings.booking.cancelHours });
  }),
);

async function ownChangeable(userId: string, id: string) {
  const booking = await prisma.booking.findFirst({ where: { id, userId }, include: { quest: true } });
  if (!booking) throw notFound('Запись не найдена');
  if (!['NEW', 'CONFIRMED'].includes(booking.status)) throw badRequest('Эту запись уже нельзя изменить');
  const settings = await getSettings();
  if (booking.startAt.getTime() - Date.now() < settings.booking.cancelHours * 3_600_000) {
    throw badRequest(
      `Отменить или перенести запись можно не позднее чем за ${settings.booking.cancelHours} ч до начала. Позвоните администратору.`,
      'TOO_LATE',
    );
  }
  return booking;
}

bookingsRouter.post(
  '/:id/cancel',
  ah(async (req, res) => {
    const booking = await ownChangeable(req.user!.id, req.params.id);
    res.json(await setBookingStatus(booking.id, 'CANCELLED'));
  }),
);

bookingsRouter.post(
  '/:id/reschedule',
  ah(async (req, res) => {
    const { startAt } = parse(z.object({ startAt: z.coerce.date() }), req.body);
    const booking = await ownChangeable(req.user!.id, req.params.id);
    const exclude = [booking.id, booking.linkedBookingId].filter(Boolean) as string[];
    const slots = await resolveSlots(booking.questId, startAt, !!booking.linkedBookingId, {
      userId: req.user!.id,
      excludeBookingIds: exclude,
    });
    if (!slots) throw new HttpError(409, 'Это время недоступно', 'SLOT_TAKEN');
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: { startAt: slots[0].start, endAt: slots[0].end, status: 'NEW', reminded2: false, reminded24: false },
      });
      if (booking.linkedBookingId && slots[1]) {
        await tx.booking.update({
          where: { id: booking.linkedBookingId },
          data: { startAt: slots[1].start, endAt: slots[1].end, status: 'NEW' },
        });
      }
      await tx.slotHold.deleteMany({ where: { userId: req.user!.id } });
    });
    res.json(await prisma.booking.findUnique({ where: { id: booking.id }, include: bookingInclude }));
  }),
);
