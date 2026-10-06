import { Router } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ah, parse } from '../../lib/http.js';
import { buildGrid, dateKey } from '../../lib/slots.js';
import { adminLog, requirePerm } from '../../middleware/auth.js';

export const adminReportsRouter = Router();

const periodSchema = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

const STATUS_RU = { NEW: 'Новая', CONFIRMED: 'Подтверждена', COMPLETED: 'Завершена', CANCELLED: 'Отменена', NO_SHOW: 'Неявка' } as const;
const SOURCE_RU = { WEB: 'Сайт', ADMIN: 'Админ', PHONE: 'Телефон', WALK_IN: 'Без записи' } as const;

/** второй сеанс двойной аренды — служебная запись, цена учтена в первом */
const isSecondSession = (b: { isDoubleSession: boolean; linkedBookingId: string | null }) =>
  b.isDoubleSession && !b.linkedBookingId;

async function loadPeriod(fromS: string, toS: string) {
  const from = new Date(`${fromS}T00:00:00`);
  const to = new Date(new Date(`${toS}T00:00:00`).getTime() + 86_400_000);
  const [bookings, quests, payments] = await Promise.all([
    prisma.booking.findMany({
      where: { startAt: { gte: from, lt: to } },
      include: { quest: { select: { title: true } }, user: { select: { name: true, phone: true } } },
      orderBy: { startAt: 'asc' },
    }),
    prisma.quest.findMany({ include: { schedules: true } }),
    prisma.payment.findMany({ where: { status: 'SUCCEEDED', paidAt: { gte: from, lt: to } } }),
  ]);
  return { from, to, bookings, quests, payments };
}

adminReportsRouter.get(
  '/reports',
  requirePerm('reports.view'),
  ah(async (req, res) => {
    const q = parse(periodSchema, req.query);
    const { from, to, bookings, quests, payments } = await loadPeriod(q.from, q.to);
    const main = bookings.filter((b) => !isSecondSession(b));
    const done = main.filter((b) => b.status === 'COMPLETED');
    const revenue = done.reduce((s, b) => s + b.finalPrice, 0);
    const created = main.length;
    const cancelled = main.filter((b) => b.status === 'CANCELLED').length;
    const noShows = main.filter((b) => b.status === 'NO_SHOW').length;
    const upcoming = main.filter((b) => ['NEW', 'CONFIRMED'].includes(b.status)).length;

    // загрузка = занятые сеансы / все сеансы по расписанию
    const byQuest = quests.map((quest) => {
      let totalSlots = 0;
      for (let d = new Date(from); d < to; d = new Date(d.getTime() + 86_400_000)) {
        totalSlots += buildGrid(quest, quest.schedules, dateKey(d)).length;
      }
      const qb = bookings.filter((b) => b.questId === quest.id && ['NEW', 'CONFIRMED', 'COMPLETED'].includes(b.status));
      const qDone = qb.filter((b) => b.status === 'COMPLETED');
      return {
        questId: quest.id,
        title: quest.title,
        sessions: qb.length,
        totalSlots,
        load: totalSlots ? Math.round((qb.length / totalSlots) * 100) : 0,
        revenue: qDone.reduce((s, b) => s + b.finalPrice, 0),
        players: qDone.filter((b) => !isSecondSession(b)).reduce((s, b) => s + b.playersCount, 0),
      };
    });

    const days: Record<string, { date: string; revenue: number; bookings: number }> = {};
    for (let d = new Date(from); d < to; d = new Date(d.getTime() + 86_400_000)) {
      days[dateKey(d)] = { date: dateKey(d), revenue: 0, bookings: 0 };
    }
    for (const b of main) {
      const k = dateKey(b.startAt);
      if (!days[k]) continue;
      days[k].bookings++;
      if (b.status === 'COMPLETED') days[k].revenue += b.finalPrice;
    }

    res.json({
      revenue,
      recordingsRevenue: payments.filter((p) => p.purpose === 'RECORDING').reduce((s, p) => s + p.amount, 0),
      prepayments: payments.filter((p) => p.purpose === 'BOOKING_PREPAY').reduce((s, p) => s + p.amount, 0),
      bookings: created,
      completed: done.length,
      cancelled,
      noShows,
      upcoming,
      avgCheck: done.length ? Math.round(revenue / done.length) : 0,
      // конверсия заявки в состоявшуюся игру (без ещё не прошедших)
      conversion: created - upcoming ? Math.round((done.length / (created - upcoming)) * 100) : 0,
      bySource: Object.entries(SOURCE_RU).map(([k, label]) => ({ source: label, count: main.filter((b) => b.source === k).length })),
      byQuest,
      byDay: Object.values(days),
    });
  }),
);

adminReportsRouter.get(
  '/reports/export',
  requirePerm('reports.view'),
  ah(async (req, res) => {
    const q = parse(periodSchema.extend({ format: z.enum(['csv', 'xlsx']).default('xlsx') }), req.query);
    const { bookings } = await loadPeriod(q.from, q.to);
    const header = ['ID', 'Дата', 'Время', 'Квест', 'Клиент', 'Телефон', 'Игроков', 'Статус', 'Источник', 'Цена', 'Скидка %', 'Итого', 'Предоплата', 'Двойной сеанс'];
    const rows = bookings
      .filter((b) => !isSecondSession(b))
      .map((b) => [
        b.id,
        b.startAt.toLocaleDateString('ru-RU'),
        b.startAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        b.quest.title,
        b.user.name ?? '',
        b.user.phone,
        b.playersCount,
        STATUS_RU[b.status],
        SOURCE_RU[b.source],
        b.basePrice,
        b.discountPercent,
        b.finalPrice,
        b.prepaid,
        b.isDoubleSession ? 'да' : '',
      ]);
    await adminLog(req, 'report.export', 'Report', null, q);
    const filename = `report_${q.from}_${q.to}.${q.format}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (q.format === 'csv') {
      const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      // BOM — чтобы Excel корректно открыл кириллицу
      return res.send('﻿' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n'));
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Записи');
    ws.addRow(header).font = { bold: true };
    rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c) => (c.width = 16));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await wb.xlsx.write(res);
    res.end();
  }),
);
