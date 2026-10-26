import { describe, expect, it } from 'vitest';
import { allEvents } from '../events';
import { createRng, type RngFn } from './rng';
import { generateCharacter } from './birth';
import { runYearTick, resolvePendingChoice, type TickResult } from './tick';
import type { Character, Country, Region } from '../types';

function stepOneLife(
  character: Character,
  country: Country,
  region: Region | null,
  rng: RngFn,
  firedOnce: Set<string>,
  maxAge = 115,
): { violations: number; finalCharacter: Character } {
  let char = character;
  let violations = 0;
  while (char.alive && char.ageYears < maxAge) {
    const result: TickResult = runYearTick(char, country, region, allEvents, firedOnce, rng);
    char = result.character;

    const touchedDefs = [...result.fired.map((f) => f.def), ...(result.pendingChoice ? [result.pendingChoice.def] : [])];
    for (const def of touchedDefs) {
      if (char.ageYears < def.ageGate[0] || char.ageYears > def.ageGate[1]) violations++;
      if (def.once) firedOnce.add(def.id);
    }

    if (result.pendingChoice) {
      const choice = result.pendingChoice.choices[Math.floor(rng() * result.pendingChoice.choices.length)];
      char = resolvePendingChoice(char, result.pendingChoice, choice);
    }
  }
  return { violations, finalCharacter: char };
}

describe('каталог событий (раздел 9/18)', () => {
  it('ни одно событие не нарушает свои возрастные ворота за 50 000 тиков', () => {
    const rng = createRng('age-gate-check-ticks');
    let totalTicks = 0;
    let totalViolations = 0;
    let lifeIndex = 0;

    while (totalTicks < 50_000) {
      const seed = `age-gate-life-${lifeIndex++}`;
      const { character, country, region } = generateCharacter(seed, createRng(seed), { mode: 'random' });
      const firedOnce = new Set<string>();
      const before = totalTicks;
      let char = character;
      while (char.alive && char.ageYears < 115 && totalTicks - before < 200) {
        const result = runYearTick(char, country, region, allEvents, firedOnce, rng);
        char = result.character;
        totalTicks++;
        const touchedDefs = [
          ...result.fired.map((f) => f.def),
          ...(result.pendingChoice ? [result.pendingChoice.def] : []),
        ];
        for (const def of touchedDefs) {
          if (char.ageYears < def.ageGate[0] || char.ageYears > def.ageGate[1]) totalViolations++;
          if (def.once) firedOnce.add(def.id);
        }
        if (result.pendingChoice) {
          const choice = result.pendingChoice.choices[Math.floor(rng() * result.pendingChoice.choices.length)];
          char = resolvePendingChoice(char, result.pendingChoice, choice);
        }
      }
    }
    expect(totalViolations).toBe(0);
  }, 60_000);

  it('один сид даёт побайтово идентичный таймлайн в двух прогонах', () => {
    const seed = 'full-life-determinism-check';
    const run = () => {
      const { character, country, region } = generateCharacter(seed, createRng(seed), { mode: 'random' });
      const rng = createRng(seed);
      const firedOnce = new Set<string>();
      const log: unknown[] = [];
      let char = character;
      for (let i = 0; i < 200 && char.alive; i++) {
        const result = runYearTick(char, country, region, allEvents, firedOnce, rng);
        char = result.character;
        if (result.pendingChoice) {
          const choice = result.pendingChoice.choices[Math.floor(rng() * result.pendingChoice.choices.length)];
          char = resolvePendingChoice(char, result.pendingChoice, choice);
          if (result.pendingChoice.def.once) firedOnce.add(result.pendingChoice.def.id);
        }
        for (const f of result.fired) {
          if (f.def.once) firedOnce.add(f.def.id);
        }
        log.push({
          age: char.ageYears,
          alive: char.alive,
          stats: char.stats,
          traits: char.traits,
          fired: result.fired.map((f) => f.def.id),
          pending: result.pendingChoice?.def.id ?? null,
          cause: result.causeOfDeath?.id ?? null,
        });
      }
      return log;
    };
    expect(run()).toEqual(run());
  }, 20_000);
});

describe('требуемая связка arranged_marriage (раздел 10/16)', () => {
  it('существует ровно одно событие с id "arranged_marriage" и без weightBy', () => {
    const matches = allEvents.filter((e) => e.id === 'arranged_marriage');
    expect(matches.length).toBe(1);
    expect(matches[0].weightBy).toBeUndefined();
    expect(matches[0].category).toBe('marriage');
  });
});
