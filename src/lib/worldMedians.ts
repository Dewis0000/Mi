// Население-взвешенные мировые средние для таблицы сравнения в эпилоге
// (раздел 14) — вычисляются из настоящих данных стран, а не подбираются
// "для красоты" (принцип 4 из раздела 1).
import { countries, getTradition } from '../data';

let cachedWorldLifeExpectancy: number | null = null;
let cachedWorldSchoolingYears: number | null = null;
let cachedWorldExpectedChildren: number | null = null;

function weightedAverage(values: Array<{ value: number; weight: number }>): number {
  const totalWeight = values.reduce((s, v) => s + v.weight, 0);
  if (totalWeight === 0) return 0;
  return values.reduce((s, v) => s + v.value * v.weight, 0) / totalWeight;
}

export function worldMedianLifeExpectancy(): number {
  if (cachedWorldLifeExpectancy === null) {
    cachedWorldLifeExpectancy = weightedAverage(
      countries.map((c) => ({ value: (c.lifeExpectancy.male + c.lifeExpectancy.female) / 2, weight: c.population })),
    );
  }
  return cachedWorldLifeExpectancy;
}

export function worldMedianSchoolingYears(): number {
  if (cachedWorldSchoolingYears === null) {
    cachedWorldSchoolingYears = weightedAverage(countries.map((c) => ({ value: c.schoolingYears, weight: c.population })));
  }
  return cachedWorldSchoolingYears;
}

export function worldMedianExpectedChildren(): number {
  if (cachedWorldExpectedChildren === null) {
    cachedWorldExpectedChildren = weightedAverage(
      countries.flatMap((c) =>
        c.traditionPacks.map((packId) => ({ value: getTradition(packId).norms.expectedChildren, weight: c.population / c.traditionPacks.length })),
      ),
    );
  }
  return cachedWorldExpectedChildren;
}

export function countryAverageExpectedChildren(traditionPackIds: string[]): number {
  if (traditionPackIds.length === 0) return worldMedianExpectedChildren();
  const values = traditionPackIds.map((id) => getTradition(id).norms.expectedChildren);
  return values.reduce((s, v) => s + v, 0) / values.length;
}
