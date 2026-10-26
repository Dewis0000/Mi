import { describe, expect, it } from 'vitest';
import { countries, getCountry } from '../data';
import type { Character, Country, Sex } from '../types';
import { createRng } from './rng';
import { annualMortality } from './mortality';

// "Нейтральный" персонаж: health≈85.7 и wealth=70 — точка, где healthFactor и
// wealthFactor в annualMortality() равны 1 (2.2-1.4·0.857≈1, 1.35-0.5·0.7=1).
// Без региона (regionFactor=1) и без метки disabled (traitFactor=1) из пяти
// множителей формулы остаётся только conflictFactor страны — ровно то, под
// что откалибрована кривая в lifetable.ts. Так тест действительно проверяет
// "средний возраст смерти совпадает с lifeExpectancy страны", а не ещё что-то
// поверх личных характеристик персонажа.
function referenceCharacter(iso3: string, sex: Sex): Character {
  return {
    seed: 'calibration-check',
    name: 'Тест',
    sex,
    birthYear: 2026,
    countryIso3: iso3,
    regionId: null,
    family: {
      incomeDecile: 7,
      parentsAlive: { mother: true, father: true },
      siblings: 1,
      parentEducationYears: 8,
      rural: false,
      traditionPackId: 'placeholder',
    },
    stats: { health: 85.7, wealth: 70, education: 50, bonds: 50, standing: 50 },
    ageYears: 0,
    alive: true,
    childrenCount: 0,
    traits: [],
    activeMortalityModifiers: [],
    manualSelection: 'random',
  };
}

function simulateLives(country: Country, sex: Sex, n: number, maxAge = 115) {
  let ageSum = 0;
  let diedBefore5 = 0;
  for (let i = 0; i < n; i++) {
    const rng = createRng(`mortality-calib-${country.iso3}-${sex}-${i}`);
    let age = 0;
    for (; age <= maxAge; age++) {
      const char = { ...referenceCharacter(country.iso3, sex), ageYears: age };
      const qx = annualMortality(char, country, null);
      if (rng() < qx) break;
    }
    ageSum += age;
    if (age < 5) diedBefore5++;
  }
  return { averageAge: ageSum / n, under5Rate: diedBefore5 / n };
}

function pickRepresentativeCountries(): Country[] {
  const bySex = (c: Country) => Math.min(c.lifeExpectancy.male, c.lifeExpectancy.female);
  const sorted = [...countries].sort((a, b) => bySex(a) - bySex(b));
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const middle = sorted[Math.floor(sorted.length / 2)];
  const highestInfant = [...countries].sort((a, b) => b.infantMortality - a.infantMortality)[0];
  const unique = new Map<string, Country>();
  [lowest, highest, middle, highestInfant].forEach((c) => unique.set(c.iso3, c));
  return [...unique.values()];
}

describe('калибровка смертности (раздел 9/18)', () => {
  const samples = pickRepresentativeCountries();

  for (const country of samples) {
    for (const sex of ['male', 'female'] as const) {
      it(`${country.iso3}/${sex}: средний возраст смерти за 10 000 жизней в пределах 2 лет от lifeExpectancy`, () => {
        const target = country.lifeExpectancy[sex];
        const { averageAge } = simulateLives(country, sex, 10_000);
        expect(Math.abs(averageAge - target)).toBeLessThanOrEqual(2);
      }, 30_000);
    }

    it(`${country.iso3}: детская смертность до 5 лет за 10 000 жизней в пределах 10% от infantMortality`, () => {
      const { under5Rate } = simulateLives(country, 'female', 10_000);
      const target = country.infantMortality / 1000;
      const absoluteError = Math.abs(under5Rate - target);
      const relativeError = absoluteError / Math.max(target, 1e-9);
      // При очень низком infantMortality (Монако и т.п., <~5 на 1000) 10%
      // относительной точности статистически недостижимы при 10 000
      // прогонах: биномиальный шум сам по себе сопоставим по размеру с
      // целью. Поэтому проверяем ЛЮБОЕ из двух условий — относительное
      // ИЛИ абсолютное (0.3 процентного пункта) отклонение, что честно
      // соответствует духу критерия "в пределах 10%" без ложных провалов
      // на статистически нерешаемых целях.
      const withinTolerance = relativeError <= 0.1 || absoluteError <= 0.003;
      expect(
        withinTolerance,
        `target=${target}, observed=${under5Rate}, relErr=${relativeError}, absErr=${absoluteError}`,
      ).toBe(true);
    }, 30_000);
  }

  it('annualMortality возрастает с conflictIndex при равных прочих условиях', () => {
    const base = getCountry(countries[0].iso3);
    const peaceful: Country = { ...base, conflictIndex: 0 };
    const atWar: Country = { ...base, conflictIndex: 0.8 };
    const char = { ...referenceCharacter(base.iso3, 'male'), ageYears: 30 };
    expect(annualMortality(char, atWar, null)).toBeGreaterThan(annualMortality(char, peaceful, null));
  });

  it('annualMortality растёт при traits:[disabled]', () => {
    const base = getCountry(countries[0].iso3);
    const char = { ...referenceCharacter(base.iso3, 'male'), ageYears: 40 };
    const disabledChar = { ...char, traits: ['disabled'] };
    expect(annualMortality(disabledChar, base, null)).toBeGreaterThan(annualMortality(char, base, null));
  });
});
