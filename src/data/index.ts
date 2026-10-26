import countriesRaw from './countries.json';
import regionsRaw from './regions.json';
import traditionsRaw from './traditions.json';
import causesRaw from './causes.json';
import type { CauseOfDeath, Country, Region, TraditionPack } from '../types';
import { buildCumulative } from '../engine/rng';

export const countries = countriesRaw as unknown as Country[];
export const regions = regionsRaw as unknown as Region[];
export const traditions = traditionsRaw as unknown as TraditionPack[];
export const causes = causesRaw as unknown as CauseOfDeath[];

export const countryByIso3 = new Map<string, Country>(countries.map((c) => [c.iso3, c]));
export const regionById = new Map<string, Region>(regions.map((r) => [r.id, r]));
export const traditionById = new Map<string, TraditionPack>(traditions.map((t) => [t.id, t]));
export const causeById = new Map<string, CauseOfDeath>(causes.map((c) => [c.id, c]));

export const regionsByCountry = new Map<string, Region[]>();
for (const r of regions) {
  const list = regionsByCountry.get(r.countryIso3) ?? [];
  list.push(r);
  regionsByCountry.set(r.countryIso3, list);
}

export const birthsWeights = countries.map((c) => c.birthsPerYear);
export const birthsCumulative = buildCumulative(birthsWeights);
export const birthsTotal = birthsCumulative[birthsCumulative.length - 1] ?? 0;

export function getCountry(iso3: string): Country {
  const c = countryByIso3.get(iso3);
  if (!c) throw new Error(`Unknown country iso3: ${iso3}`);
  return c;
}

export function getRegion(id: string): Region | null {
  return regionById.get(id) ?? null;
}

export function getRegionsFor(iso3: string): Region[] {
  return regionsByCountry.get(iso3) ?? [];
}

export function getTradition(id: string): TraditionPack {
  const t = traditionById.get(id);
  if (!t) throw new Error(`Unknown tradition pack: ${id}`);
  return t;
}

export function causesInRange(age: number): CauseOfDeath[] {
  return causes.filter((c) => age >= c.ageGate[0] && age <= c.ageGate[1]);
}

export function causeLabel(id: string | null, locale: string): string {
  if (!id) return '—';
  const cause = causeById.get(id);
  if (!cause) return id;
  return cause.label[locale] ?? cause.label.ru ?? id;
}
