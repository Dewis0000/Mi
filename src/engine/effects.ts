// Применение последствий событий и выборов к персонажу (раздел 9/10).

import type { Character, Choice, Stats } from '../types';
import { clamp } from './rng';

export function applyStatEffects(character: Character, effects?: Partial<Stats>): Character {
  if (!effects) return character;
  const stats = { ...character.stats };
  (Object.keys(effects) as Array<keyof Stats>).forEach((key) => {
    const delta = effects[key];
    if (delta === undefined) return;
    stats[key] = clamp(stats[key] + delta, 0, 100);
  });
  return { ...character, stats };
}

export function applyUnlockTraits(character: Character, traits?: string[]): Character {
  if (!traits || traits.length === 0) return character;
  const existing = new Set(character.traits);
  let changed = false;
  for (const t of traits) {
    if (!existing.has(t)) {
      existing.add(t);
      changed = true;
    }
  }
  return changed ? { ...character, traits: Array.from(existing) } : character;
}

export function applyMortalityDelta(
  character: Character,
  multiplier: number | undefined,
  years: number | undefined,
  tag: string,
): Character {
  if (!multiplier || multiplier === 1) return character;
  const untilYear = character.birthYear + character.ageYears + Math.max(1, years ?? 1);
  return {
    ...character,
    activeMortalityModifiers: [
      ...character.activeMortalityModifiers,
      { id: `${tag}_${character.ageYears}_${character.activeMortalityModifiers.length}`, multiplier, untilYear },
    ],
  };
}

export function pruneExpiredModifiers(character: Character): Character {
  const currentYear = character.birthYear + character.ageYears;
  const kept = character.activeMortalityModifiers.filter((m) => m.untilYear >= currentYear);
  if (kept.length === character.activeMortalityModifiers.length) return character;
  return { ...character, activeMortalityModifiers: kept };
}

export function applyChoice(character: Character, defId: string, choice: Choice): Character {
  let next = applyStatEffects(character, choice.effects);
  next = applyUnlockTraits(next, choice.unlockTraits);
  next = applyMortalityDelta(next, choice.mortalityDelta, choice.mortalityYears, `${defId}_${choice.id}`);
  return next;
}

interface AmbientLike {
  id: string;
  effects?: Partial<Stats>;
  mortalityDelta?: number;
  mortalityYears?: number;
  unlockTraits?: string[];
}

export function applyAmbient(character: Character, def: AmbientLike): Character {
  let next = applyStatEffects(character, def.effects);
  next = applyUnlockTraits(next, def.unlockTraits);
  next = applyMortalityDelta(next, def.mortalityDelta, def.mortalityYears, def.id);
  return next;
}
