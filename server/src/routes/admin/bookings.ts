import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError, ah, notFound, parse } from '../../lib/http.js';
import { phoneSchema } from '../../lib/phone.js';
import { adminLog, requirePerm } from '../../middleware/auth.js';
import { createBooking, setBookingStatus } from '../../services/bookings.js';

export const adminBookingsRouter = Router();

const statusEnum = z.enum(['NEW', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']);

const include = {
  user: { select: { id: true, name: true, phone: true, points: true, blocked: true } },
  quest: { select: { id: true, title: true, durationMin: true, roomNumber: true } },
  linkedBooking: { select: { id: true, startAt: true, endAt: true } },
} satisfies Prisma.BookingInclude;

function dayStart(s: string) {
  return new Date(`${s}T00:00:00`);
}

adminBookingsRouter.get(
  '/dashboard',
  requirePerm('dashboard.view'),
  ah(async (_req, res) => {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const [next, todayList, newCount, live] = await Promise.all([
      prisma.booking.findFirst({
        where: { status: { in: ['NEW', 'CONFIRMED'] }, startAt: { gt: now }, linkedFrom: { is: null } },
        orderBy: { startAt: 'asc' },
        include,
      }),
      prisma.booking.findMany({
        where: { startAt: { gte: today, lt: tomorrow }, status: { not: 'CANCELLED' }, linkedFrom: { is: null } },
        orderBy: { startAt: 'asc' },
        include,
      }),
      prisma.booking.count({ where: { status: 'NEW', linkedFrom: { is: null }, startAt: { gt: now } } }),
      prisma.booking.findMany({
        where: { status: { in: ['NEW', 'CONFIRMED'] }, startAt: { lte: now }, endAt: { gt: now } },
        include,
      }),
    ]);
    res.json({
      next,
      today: todayList,
      newCount,
      live,
      todayRevenue: todayList.filter((b) => b.status !== 'NO_SHOW').reduce((s, b) => s + b.finalPrice, 0),
    });
  }),
);

adminBookingsRouter.get(
  '/bookings',
  requirePerm('bookings.view'),
  ah(async (req, res) => {
    const q = parse(
      z.object({
        status: z.string().optional(),
        questId: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        q: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(30),
        sort: z.enum(['asc', 'desc']).default('desc'),
      }),
      req.query,
    );
    const where: Prisma.BookingWhereInput = { linkedFrom: { is: null } };
    if (q.status) where.status = { in: q.status.split(',').map((s) => statusEnum.parse(s)) };
    if (q.questId) where.questId = q.questId;
    if (q.from || q.to) {
      where.startAt = {
        gte: q.from ? dayStart(q.from) : undefined,
        lt: q.to ? new Date(dayStart(q.to).getTime() + 86_400_000) : undefined,
      };
    }
    if (q.q) {
      const digits = q.q.replace(/\D/g, '');
      where.user = {
        OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits.length >= 10 ? digits.slice(-10) : digits } }] : []),
        ],
      };
    }
    const [items, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include,
        orderBy: { startAt: q.sort },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.booking.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

/** Календарное представление загрузки */
adminBookingsRouter.get(
  '/bookings/calendar',
  requirePerm('bookings.view'),
  ah(async (req, res) => {
    const q = parse(z.object({ from: z.string(), to: z.string() }), req.query);
    const items = await prisma.booking.findMany({
      where: {
        status: { in: ['NEW', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'] },
        startAt: { gte: dayStart(q.from), lt: new Date(dayStart(q.to).getTime() + 86_400_000) },
      },
      include,
      orderBy: { startAt: 'asc' },
    });
    res.json(items);
  }),
);

adminBookingsRouter.get(
  '/bookings/:id',
  requirePerm('bookings.view'),
  ah(async (req, res) => {
    const b = await prisma.booking.findUnique({ where: { id: req.params.id }, include: { ...include, recordings: true } });
    if (!b) throw notFound();
    res.json({ ...b, recordings: b.recordings.map((r) => ({ ...r, sizeBytes: Number(r.sizeBytes) })) });
  }),
);

/** Ручное добавление записи (звонок, приход без записи) */
adminBookingsRouter.post(
  '/bookings',
  requirePerm('bookings.edit'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        phone: phoneSchema,
        name: z.string().trim().min(1).max(60).optional(),
        questId: z.string(),
        startAt: z.coerce.date(),
        playersCount: z.number().int().min(1).max(50),
        ages: z.array(z.number().int().min(1).max(120)).min(1),
        double: z.boolean().default(false),
        comment: z.string().max(1000).optional(),
        finalPrice: z.number().int().min(0).optional(),
        source: z.enum(['ADMIN', 'PHONE', 'WALK_IN']).default('PHONE'),
        confirm: z.boolean().default(true),
      }),
      req.body,
    );
    const quest = await prisma.quest.findUnique({ where: { id: body.questId } });
    if (!quest) throw notFound('Квест не найден');
    let user = await prisma.user.findUnique({ where: { phone: body.phone } });
    if (!user) {
      user = await prisma.user.create({ data: { phone: body.phone, name: body.name, phoneVerified: true } });
      await adminLog(req, 'user.create', 'User', user.id, { phone: body.phone, name: body.name });
    }
    const { booking } = await createBooking({
      user,
      quest,
      startAt: body.startAt,
      playersCount: body.playersCount,
      ages: body.ages,
      double: body.double,
      comment: body.comment,
      source: body.source,
      ignoreLead: true,
      priceOverride: body.finalPrice !== undefined ? { finalPrice: body.finalPrice } : undefined,
    });
    if (body.confirm) await setBookingStatus(booking.id, 'CONFIRMED');
    await adminLog(req, 'booking.create', 'Booking', booking.id, body);
    res.status(201).json(booking);
  }),
);

/** Изменение любых данных записи */
adminBookingsRouter.patch(
  '/bookings/:id',
  requirePerm('bookings.edit'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        questId: z.string().optional(),
        startAt: z.coerce.date().optional(),
        playersCount: z.number().int().min(1).max(50).optional(),
        ages: z.array(z.number().int().min(1).max(120)).optional(),
        basePrice: z.number().int().min(0).optional(),
        discountPercent: z.number().int().min(0).max(100).optional(),
        finalPrice: z.number().int().min(0).optional(),
        comment: z.string().max(1000).nullable().optional(),
        adminNote: z.string().max(2000).nullable().optional(),
        force: z.boolean().default(false),
      }),
      req.body,
    );
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id }, include: { quest: true } });
    if (!booking) throw notFound();
    const questId = body.questId ?? booking.questId;
    const quest = questId === booking.questId ? booking.quest : await prisma.quest.findUnique({ where: { id: questId } });
    if (!quest) throw notFound('Квест не найден');
    const startAt = body.startAt ?? booking.startAt;
    const endAt = new Date(startAt.getTime() + quest.durationMin * 60_000);

    if ((body.startAt || body.questId) && !body.force) {
      const clash = await prisma.booking.findFirst({
        where: {
          id: { notIn: [booking.id, booking.linkedBookingId ?? ''] },
          questId,
          status: { in: ['NEW', 'CONFIRMED'] },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        include: { user: true },
      });
      if (clash) {
        throw new HttpError(409, 'На это время уже есть запись', 'SLOT_TAKEN', {
          clash: { id: clash.id, startAt: clash.startAt, name: clash.user.name },
        });
      }
    }

    const base = body.basePrice ?? booking.basePrice;
    const percent = body.discountPercent ?? booking.discountPercent;
    const finalPrice =
      body.finalPrice ?? (body.basePrice !== undefined || body.discountPercent !== undefined ? Math.round(base * (1 - percent / 100)) : booking.finalPrice);

    const updated = await prisma.$transaction(async (tx) => {
      if (booking.linkedBookingId && (body.startAt || body.questId)) {
        // второй сеанс сдвигаем вслед за первым
        const shift = startAt.getTime() - booking.startAt.getTime();
        const second = await tx.booking.findUnique({ where: { id: booking.linkedBookingId } });
        if (second) {
          await tx.booking.update({
            where: { id: second.id },
            data: { questId, startAt: new Date(second.startAt.getTime() + shift), endAt: new Date(second.startAt.getTime() + shift + quest.durationMin * 60_000) },
          });
        }
      }
      return tx.booking.update({
        where: { id: booking.id },
        data: {
          questId,
          startAt,
          endAt,
          playersCount: body.playersCount,
          ages: body.ages,
          basePrice: base,
          discountPercent: percent,
          discountAmount: base - finalPrice,
          finalPrice,
          comment: body.comment,
          adminNote: body.adminNote,
          ...(body.startAt ? { reminded24: false, reminded2: false } : {}),
        },
        include,
      });
    });
    await adminLog(req, 'booking.update', 'Booking', booking.id, { before: booking, changes: body });
    res.json(updated);
  }),
);

adminBookingsRouter.post(
  '/bookings/:id/status',
  requirePerm('bookings.edit'),
  ah(async (req, res) => {
    const body = parse(
      z.object({ status: statusEnum, passed: z.boolean().nullable().optional(), timeSpentMin: z.number().int().min(0).max(600).nullable().optional() }),
      req.body,
    );
    const updated = await setBookingStatus(req.params.id, body.status, body);
    await adminLog(req, 'booking.status', 'Booking', req.params.id, body);
    res.json(updated);
  }),
);
