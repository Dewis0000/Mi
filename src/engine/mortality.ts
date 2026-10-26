// Годовая вероятность смерти с личными модификаторами (раздел 9) и
// производные от неё величины для панели аналитики (раздел 13).

import type { CauseOfDeath, Character, Country, Region, Sex } from '../types';
import { causes as allCauses } from '../data';
import { buildCumulative, clamp, weightedIndex, type RngFn } from './rng';
import { lifeTable } from './lifetable';

export function annualMortality(c: Character, country: Country, region: Region | null): number {
  const base = lifeTable(country.iso3, c.sex, c.ageYears, country);
  const healthFactor = 2.2 - 1.4 * (c.stats.health / 100);
  const wealthFactor = 1.35 - 0.5 * (c.stats.wealth / 100);
  const regionFactor = region?.healthModifier ?? 1;
  const conflictFactor = 1 + country.conflictIndex * 0.9;
  const traitFactor = c.traits.includes('disabled') ? 1.4 : 1;
  const modifierFactor = c.activeMortalityModifiers.reduce(
    (acc, m) => (m.untilYear >= c.ageYears + c.birthYear ? acc * m.multiplier : acc),
    1,
  );
  return clamp(
    base * healthFactor * wealthFactor * regionFactor * conflictFactor * traitFactor * modifierFactor,
    0,
    0.98,
  );
}

export function rollDeath(qx: number, rng: RngFn): boolean {
  return rng() < qx;
}

/** Шанс дожить от текущего возраста персонажа до toAge, при текущих характеристиках без изменений. */
export function survivalChanceToAge(
  character: Character,
  country: Country,
  region: Region | null,
  toAge: number,
): number {
  if (toAge <= character.ageYears) return 1;
  let survival = 1;
  for (let age = character.ageYears; age < toAge; age++) {
    const qx = annualMortality({ ...character, ageYears: age }, country, region);
    survival *= 1 - qx;
  }
  return survival;
}

/** Ожидаемый остаток жизни при текущих характеристиках без изменений ("если ничего не изменится"). */
export function remainingLifeExpectancy(
  character: Character,
  country: Country,
  region: Region | null,
  maxAge = 115,
): number {
  let survival = 1;
  let e = 0;
  for (let age = character.ageYears; age < maxAge; age++) {
    const qx = annualMortality({ ...character, ageYears: age }, country, region);
    const next = survival * (1 - qx);
    e += (survival + next) / 2;
    survival = next;
  }
  return e;
}

/** Главный фактор, сильнее всего поднимающий риск прямо сейчас — для строки "главный фактор" в панели аналитики. */
export function dominantRiskFactor(
  character: Character,
  country: Country,
  region: Region | null,
): { label: 'health' | 'wealth' | 'region' | 'conflict' | 'disabled'; multiplier: number } {
  const healthFactor = 2.2 - 1.4 * (character.stats.health / 100);
  const wealthFactor = 1.35 - 0.5 * (character.stats.wealth / 100);
  const regionFactor = region?.healthModifier ?? 1;
  const conflictFactor = 1 + country.conflictIndex * 0.9;
  const traitFactor = character.traits.includes('disabled') ? 1.4 : 1;
  const candidates: Array<{ label: 'health' | 'wealth' | 'region' | 'conflict' | 'disabled'; multiplier: number }> = [
    { label: 'health', multiplier: healthFactor },
    { label: 'wealth', multiplier: wealthFactor },
    { label: 'region', multiplier: regionFactor },
    { label: 'conflict', multiplier: conflictFactor },
    { label: 'disabled', multiplier: traitFactor },
  ];
  return candidates.reduce((max, cur) => (cur.multiplier > max.multiplier ? cur : max));
}

function causeWeight(cause: CauseOfDeath, country: Country): number {
  const tierMul = cause.incomeWeight[country.incomeTier] ?? 1;
  return cause.baseWeight * tierMul;
}

/** Взвешенный выбор причины смерти по возрасту, полу и уровню дохода страны (раздел 9). */
export function pickCauseOfDeath(age: number, sex: Sex, country: Country, rng: RngFn): CauseOfDeath | null {
  const candidates = allCauses.filter(
    (c) => age >= c.ageGate[0] && age <= c.ageGate[1] && (!c.sex || c.sex === sex),
  );
  if (candidates.length === 0) return null;
  const weights = candidates.map((c) => causeWeight(c, country));
  const cumulative = buildCumulative(weights);
  const total = cumulative[cumulative.length - 1];
  if (!total || total <= 0) return candidates[0];
  const idx = weightedIndex(cumulative, total, rng());
  return candidates[idx];
}
