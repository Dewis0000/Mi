import type { Settings } from '../services/settings.js';

type Loyalty = Settings['loyalty'];

export function tierFor(points: number, loyalty: Loyalty) {
  const tiers = [...loyalty.tiers].sort((a, b) => a.from - b.from);
  let current = tiers[0];
  let next: (typeof tiers)[number] | null = null;
  for (let i = 0; i < tiers.length; i++) {
    if (points >= tiers[i].from) {
      current = tiers[i];
      next = tiers[i + 1] ?? null;
    }
  }
  return { percent: current.percent, from: current.from, next };
}

export function addMonths(d: Date, months: number) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

/**
 * Дата ближайшего сгорания баллов.
 * Баллы начинают сгорать через N месяцев без посещений, далее — каждый месяц.
 */
export function nextBurnDate(
  lastVisitAt: Date | null,
  lastBurnAt: Date | null,
  loyalty: Loyalty,
  now = new Date(),
): Date | null {
  if (!lastVisitAt) return null;
  const firstBurn = addMonths(lastVisitAt, loyalty.burnAfterMonths);
  if (firstBurn > now) return firstBurn;
  if (lastBurnAt && lastBurnAt > lastVisitAt) return addMonths(lastBurnAt, 1);
  return firstBurn; // просрочено — сгорит при ближайшем запуске задачи
}
