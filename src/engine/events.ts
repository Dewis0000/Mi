// Выбор события на тик (раздел 9: «События») и фильтрация вариантов на
// развилках (раздел 9: «Развилки», «Модификаторы выбора»).

import type { Character, Choice, Country, EventDefinition, Region, Requirement, Stats, TraditionPack } from '../types';
import { getTradition } from '../data';
import { buildCumulative, weightedIndex, type RngFn } from './rng';

function meetsRequirement(
  req: Requirement | undefined,
  character: Character,
  country: Country,
): boolean {
  if (!req) return true;
  if (req.sex && character.sex !== req.sex) return false;
  if (req.traits && !req.traits.every((t) => character.traits.includes(t))) return false;
  if (req.excludeTraits && req.excludeTraits.some((t) => character.traits.includes(t))) return false;
  if (req.statsBelow) {
    for (const key of Object.keys(req.statsBelow) as Array<keyof Stats>) {
      const threshold = req.statsBelow[key];
      if (threshold !== undefined && character.stats[key] >= threshold) return false;
    }
  }
  if (req.statsAbove) {
    for (const key of Object.keys(req.statsAbove) as Array<keyof Stats>) {
      const threshold = req.statsAbove[key];
      if (threshold !== undefined && character.stats[key] <= threshold) return false;
    }
  }
  if (req.rural !== undefined && character.family.rural !== req.rural) return false;
  if (req.urban !== undefined && req.urban === character.family.rural) return false;
  if (req.incomeTier && !req.incomeTier.includes(country.incomeTier)) return false;
  if (req.manualOk === false && character.manualSelection !== 'random') return false;
  return true;
}

function ageAppropriate(def: EventDefinition, age: number): boolean {
  return age >= def.ageGate[0] && age <= def.ageGate[1];
}

export interface EventContext {
  character: Character;
  country: Country;
  region: Region | null;
  firedOnceIds: ReadonlySet<string>;
}

export function candidateEvents(ctx: EventContext, catalog: readonly EventDefinition[]): EventDefinition[] {
  const { character, country, firedOnceIds } = ctx;
  return catalog.filter((def) => {
    if (def.once && firedOnceIds.has(def.id)) return false;
    if (!ageAppropriate(def, character.ageYears)) return false;
    if (!meetsRequirement(def.requires, character, country)) return false;
    return true;
  });
}

function computeWeight(
  def: EventDefinition,
  character: Character,
  country: Country,
  region: Region | null,
  pack: TraditionPack,
): number {
  // Особый случай: arranged_marriage весит ровно по реальной доле таких браков
  // в культурном пакете персонажа (раздел 10) — никаких других множителей.
  if (def.id === 'arranged_marriage') {
    return Math.max(pack.norms.earlyMarriageRate[character.sex], 0);
  }

  let w = def.baseWeight;
  const wb = def.weightBy;
  if (wb) {
    if (wb.rural !== undefined && character.family.rural) w *= wb.rural;
    if (wb.urban !== undefined && !character.family.rural) w *= wb.urban;
    const tierMul = wb.incomeTier?.[country.incomeTier];
    if (tierMul !== undefined) w *= tierMul;
    if (wb.conflictIndex) w *= 1 + country.conflictIndex * wb.conflictIndex;
    if (wb.homicideRate) w *= 1 + (country.homicideRate / 100) * wb.homicideRate;
    if (wb.hazardTag && region) {
      for (const hazard of region.hazards) {
        const mul = wb.hazardTag[hazard];
        if (mul !== undefined) w *= mul;
      }
    }
  }
  if (pack.flavorEvents.includes(def.id)) w *= 1.8;
  return Math.max(w, 0);
}

/** 0 событий — 0.45, одно — 0.40, два — 0.13, три — 0.02; в плотных 12–29 лет сдвинуто вверх. */
function pickEventCount(rng: RngFn, age: number): number {
  const dense = age >= 12 && age <= 29;
  const table = dense ? [0.28, 0.42, 0.22, 0.08] : [0.45, 0.4, 0.13, 0.02];
  const roll = rng();
  let acc = 0;
  for (let i = 0; i < table.length; i++) {
    acc += table[i];
    if (roll < acc) return i;
  }
  return table.length - 1;
}

export function selectEventsForTick(
  ctx: EventContext,
  catalog: readonly EventDefinition[],
  rng: RngFn,
): EventDefinition[] {
  const count = pickEventCount(rng, ctx.character.ageYears);
  if (count === 0) return [];
  const pool = candidateEvents(ctx, catalog);
  if (pool.length === 0) return [];

  const pack = getTradition(ctx.character.family.traditionPackId);
  const remaining = [...pool];
  const picked: EventDefinition[] = [];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    const weights = remaining.map((def) => computeWeight(def, ctx.character, ctx.country, ctx.region, pack));
    const cumulative = buildCumulative(weights);
    const total = cumulative[cumulative.length - 1];
    if (!total || total <= 0) break;
    const idx = weightedIndex(cumulative, total, rng());
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return picked;
}

export function availableChoices(def: EventDefinition, character: Character, country: Country): Choice[] {
  if (!def.choices) return [];
  return def.choices.filter((c) => meetsRequirement(c.requires, character, country));
}

/** Событие становится развилкой, если severity === 'major', или у него есть ≥2 доступных варианта. */
export function isChoiceEvent(def: EventDefinition, available: Choice[]): boolean {
  if (!def.choices) return false;
  if (def.severity === 'major') return true;
  return available.length >= 2;
}
