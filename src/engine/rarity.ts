// Расчёт редкости стартовой конфигурации (раздел 6, шаг 7 и раздел 13).

import type { BirthMode, Country, Family, Region, RarityReport, Sex } from '../types';
import { birthsTotal } from '../data';

const DEFAULT_MALE_SHARE = 0.512;

export function computeRarity(
  country: Country,
  region: Region | null,
  sex: Sex,
  family: Family,
  mode: BirthMode,
): RarityReport {
  const countryShare = country.birthsPerYear / birthsTotal;
  const regionShare = region ? region.populationShare : 1;
  const maleShare = country.maleBirthShare ?? DEFAULT_MALE_SHARE;
  const sexShare = sex === 'male' ? maleShare : 1 - maleShare;

  // Дециль берётся как фиксированная 1/10, а не как точная плотность
  // бета-распределения в этой точке: последнее потребовало бы функции
  // Β(a,b) ради декоративного числа в карточке рождения — не стоит сложности.
  const decileShare = 0.1;

  const ruralShareOfCountry = region
    ? region.urban
      ? country.urbanShare
      : 1 - country.urbanShare
    : family.rural
      ? 1 - country.urbanShare
      : country.urbanShare;

  const combined = Math.max(countryShare * regionShare * sexShare * decileShare * ruralShareOfCountry, 1e-9);
  const oneInN = Math.min(Math.round(1 / combined), 50_000_000);

  let tier: RarityReport['tier'] = 'обычная';
  if (oneInN >= 100_000) tier = 'исключительная';
  else if (oneInN >= 5_000) tier = 'очень редкая';
  else if (oneInN >= 500) tier = 'редкая';

  return {
    complete: mode === 'random',
    countryShare,
    regionShare,
    sexShare,
    decileShare,
    ruralUrbanShare: ruralShareOfCountry,
    combined,
    oneInN,
    tier,
  };
}
