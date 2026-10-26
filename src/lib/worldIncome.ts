// Мировой процентиль дохода (раздел 13: "42-й процентиль в мире", с учётом
// паритета покупательной способности). Строится из настоящих данных —
// gdpPerCapita (уже PPP) и population каждой страны — а не выдумывается.
// Единственное модельное допущение: децили внутри страны распределены
// линейно вокруг gdpPerCapita (0.3x на 1-м дециле до 1.56x на 10-м) — так же,
// как и остальная игра не претендует на точность official-статистики по
// отдельному человеку.
import { countries } from '../data';

interface WeightedIncome {
  income: number;
  weight: number;
}

let cachedDistribution: WeightedIncome[] | null = null;

function decileToRelativeIncome(decile: number): number {
  return 0.3 + 0.14 * decile;
}

function buildDistribution(): WeightedIncome[] {
  const points: WeightedIncome[] = [];
  for (const c of countries) {
    const weightPerDecile = c.population / 10;
    for (let decile = 1; decile <= 10; decile++) {
      points.push({ income: c.gdpPerCapita * decileToRelativeIncome(decile), weight: weightPerDecile });
    }
  }
  points.sort((a, b) => a.income - b.income);
  return points;
}

/** Процентиль (0..100) оценочного PPP-дохода персонажа в мировом распределении. */
export function worldIncomePercentile(countryGdpPerCapita: number, decile: number): number {
  if (!cachedDistribution) cachedDistribution = buildDistribution();
  const income = countryGdpPerCapita * decileToRelativeIncome(decile);
  let weightBelow = 0;
  let totalWeight = 0;
  for (const p of cachedDistribution) {
    totalWeight += p.weight;
    if (p.income <= income) weightBelow += p.weight;
  }
  if (totalWeight === 0) return 50;
  return Math.round((weightBelow / totalWeight) * 100);
}
