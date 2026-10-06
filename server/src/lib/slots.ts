import type { Quest, Schedule } from '@prisma/client';
import { prisma } from '../db.js';

export type Slot = {
  start: Date;
  end: Date;
  price: number;
  available: boolean;
  /** можно ли взять этот и следующий слот подряд (двойной сеанс) */
  doubleAvailable: boolean;
};

const ACTIVE_STATUSES = ['NEW', 'CONFIRMED'] as const;

/** Минимальный запас времени до начала сеанса для онлайн-записи */
const LEAD_MINUTES = 30;

function atTime(date: string, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

export function dateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function slotPrice(quest: Pick<Quest, 'basePrice' | 'peakExtra'>, start: Date) {
  const weekend = start.getDay() === 0 || start.getDay() === 6;
  const evening = start.getHours() >= 17 || start.getHours() < 5;
  return quest.basePrice + (weekend || evening ? quest.peakExtra : 0);
}

/** Сетка сеансов на дату: длительность квеста + технический перерыв */
export function buildGrid(quest: Quest, schedules: Schedule[], date: string) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const result: { start: Date; end: Date; group: number }[] = [];
  schedules
    .filter((s) => s.weekday === weekday)
    .forEach((s, group) => {
      const from = atTime(date, s.timeFrom);
      const to = atTime(date, s.timeTo);
      if (to <= from) to.setDate(to.getDate() + 1); // работа после полуночи
      const step = (quest.durationMin + s.breakMin) * 60_000;
      for (let t = from.getTime(); t + quest.durationMin * 60_000 <= to.getTime(); t += step) {
        result.push({ start: new Date(t), end: new Date(t + quest.durationMin * 60_000), group });
      }
    });
  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}

const overlaps = (a1: Date, a2: Date, b1: Date, b2: Date) => a1 < b2 && b1 < a2;

export async function getSlots(
  questId: string,
  date: string,
  opts: { userId?: string; excludeBookingIds?: string[]; ignoreLead?: boolean } = {},
): Promise<Slot[]> {
  const quest = await prisma.quest.findUnique({ where: { id: questId }, include: { schedules: true } });
  if (!quest) return [];
  const grid = buildGrid(quest, quest.schedules, date);
  if (!grid.length) return [];

  const from = grid[0].start;
  const to = grid[grid.length - 1].end;
  const [bookings, holds] = await Promise.all([
    prisma.booking.findMany({
      where: {
        questId,
        status: { in: [...ACTIVE_STATUSES] },
        startAt: { lt: to },
        endAt: { gt: from },
        id: opts.excludeBookingIds?.length ? { notIn: opts.excludeBookingIds } : undefined,
      },
      select: { startAt: true, endAt: true },
    }),
    prisma.slotHold.findMany({
      where: {
        questId,
        expiresAt: { gt: new Date() },
        startAt: { lt: to },
        endAt: { gt: from },
        userId: opts.userId ? { not: opts.userId } : undefined,
      },
      select: { startAt: true, endAt: true },
    }),
  ]);
  const busy = [...bookings, ...holds];
  const minStart = Date.now() + (opts.ignoreLead ? 0 : LEAD_MINUTES * 60_000);

  const base = grid.map((g) => ({
    ...g,
    price: slotPrice(quest, g.start),
    available: g.start.getTime() >= minStart && !busy.some((b) => overlaps(g.start, g.end, b.startAt, b.endAt)),
  }));
  return base.map((s, i) => {
    const next = base[i + 1];
    return {
      start: s.start,
      end: s.end,
      price: s.price,
      available: s.available,
      doubleAvailable: s.available && !!next && next.group === s.group && next.available,
    };
  });
}

/** Проверяет, что startAt — реальное начало свободного сеанса; возвращает 1 или 2 слота */
export async function resolveSlots(
  questId: string,
  startAt: Date,
  double: boolean,
  opts: { userId?: string; excludeBookingIds?: string[]; ignoreLead?: boolean } = {},
) {
  // сеансы после полуночи принадлежат сетке предыдущего дня
  const candidates = [dateKey(startAt), dateKey(new Date(startAt.getTime() - 86_400_000))];
  for (const date of candidates) {
    const slots = await getSlots(questId, date, opts);
    const idx = slots.findIndex((s) => s.start.getTime() === startAt.getTime());
    if (idx === -1) continue;
    const first = slots[idx];
    if (!first.available) return null;
    if (!double) return [first];
    if (!first.doubleAvailable) return null;
    return [first, slots[idx + 1]];
  }
  return null;
}
