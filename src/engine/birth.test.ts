import { describe, expect, it } from 'vitest';
import { countries, birthsTotal } from '../data';
import { createRng } from './rng';
import { generateCharacter } from './birth';

describe('распределение стран при рождении (раздел 6/9/18)', () => {
  it('за 100 000 рождений совпадает с долями birthsPerYear: топ-20 — отклонение не больше 0.5 п.п.', () => {
    const n = 100_000;
    const counts = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const seed = `dist-check-${i}`;
      const { country } = generateCharacter(seed, createRng(seed), { mode: 'random' });
      counts.set(country.iso3, (counts.get(country.iso3) ?? 0) + 1);
    }

    const top20 = [...countries].sort((a, b) => b.birthsPerYear - a.birthsPerYear).slice(0, 20);

    for (const c of top20) {
      const expectedShare = c.birthsPerYear / birthsTotal;
      const observedShare = (counts.get(c.iso3) ?? 0) / n;
      expect(
        Math.abs(expectedShare - observedShare),
        `${c.iso3}: expected ${(expectedShare * 100).toFixed(2)}%, observed ${(observedShare * 100).toFixed(2)}%`,
      ).toBeLessThanOrEqual(0.005);
    }
  }, 30_000);

  it('один сид даёт идентичный результат рождения в двух прогонах', () => {
    const seed = 'determinism-birth-check';
    const a = generateCharacter(seed, createRng(seed), { mode: 'random' });
    const b = generateCharacter(seed, createRng(seed), { mode: 'random' });
    expect(a.character).toEqual(b.character);
    expect(a.country.iso3).toEqual(b.country.iso3);
    expect(a.region?.id).toEqual(b.region?.id);
    expect(a.rarity).toEqual(b.rarity);
  });

  it('ручной выбор страны помечает отчёт о редкости как неполный', () => {
    const seed = 'manual-country-check';
    const { rarity } = generateCharacter(seed, createRng(seed), { mode: 'country', countryIso3: countries[0].iso3 });
    expect(rarity.complete).toBe(false);
  });

  it('случайный режим помечает отчёт о редкости как полный', () => {
    const seed = 'random-mode-check';
    const { rarity } = generateCharacter(seed, createRng(seed), { mode: 'random' });
    expect(rarity.complete).toBe(true);
  });
});
