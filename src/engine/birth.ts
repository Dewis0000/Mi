// Генератор рождения (раздел 6). Самый важный алгоритм игры: распределение
// исходов обязано совпадать с реальной демографией за много прогонов.

import type { BirthMode, Character, Country, Family, Region, RarityReport, Sex, Stats } from '../types';
import {
  birthsCumulative,
  birthsTotal,
  countries,
  getCountry,
  getRegion,
  getRegionsFor,
  getTradition,
} from '../data';
import { buildCumulative, clamp, jitter, samplePoisson, sampleBeta, weightedIndex, type RngFn } from './rng';
import { computeRarity } from './rarity';

const DEFAULT_MALE_SHARE = 0.512;
const DECILE_ALPHA = 2.1;

function giniToBeta(gini: number): number {
  return DECILE_ALPHA + clamp(gini, 0, 0.9) * 6.5;
}

export interface BirthOptions {
  mode: BirthMode;
  countryIso3?: string;
  regionId?: string;
}

export interface BirthResult {
  character: Character;
  country: Country;
  region: Region | null;
  rarity: RarityReport;
}

function pickCountry(rng: RngFn): Country {
  const idx = weightedIndex(birthsCumulative, birthsTotal, rng());
  return countries[idx];
}

function pickRegion(rng: RngFn, country: Country): Region | null {
  const regionList = getRegionsFor(country.iso3);
  if (regionList.length === 0) return null;
  const weights = regionList.map((r) => r.populationShare);
  const cumulative = buildCumulative(weights);
  const total = cumulative[cumulative.length - 1];
  const idx = weightedIndex(cumulative, total, rng());
  return regionList[idx];
}

function pickSex(rng: RngFn, country: Country): Sex {
  const maleShare = country.maleBirthShare ?? DEFAULT_MALE_SHARE;
  return rng() < maleShare ? 'male' : 'female';
}

function pickFamily(rng: RngFn, country: Country, region: Region | null): Family {
  const betaParam = giniToBeta(country.gini);
  const decileRoll = sampleBeta(rng, DECILE_ALPHA, betaParam);
  const incomeDecile = clamp(Math.ceil(decileRoll * 10), 1, 10);

  const rural = region ? !region.urban : rng() >= country.urbanShare;

  const traditionPackId = country.traditionPacks[Math.floor(rng() * country.traditionPacks.length)];
  const pack = getTradition(traditionPackId);

  const lambda = Math.max(0.15, pack.norms.expectedChildren - 1);
  const siblings = samplePoisson(rng, lambda);

  const parentEducationYears = clamp(
    Math.round(country.schoolingYears * (0.5 + incomeDecile * 0.08)),
    0,
    22,
  );

  return {
    incomeDecile,
    parentsAlive: { mother: true, father: true },
    siblings,
    parentEducationYears,
    rural,
    traditionPackId,
  };
}

function pickStartingHealth(rng: RngFn, country: Country, family: Family): number {
  let health = 100;
  health -= country.infantMortality * 0.25;
  health -= Math.max(0, 5 - family.incomeDecile) * 2.2;
  if (family.rural && (country.incomeTier === 'low' || country.incomeTier === 'lower-middle')) {
    health -= 6;
  }
  health += jitter(rng, 8);
  return clamp(Math.round(health), 1, 100);
}

function pickName(rng: RngFn, sex: Sex, packId: string): string {
  const pack = getTradition(packId);
  const given = pack.namePool[sex][Math.floor(rng() * pack.namePool[sex].length)];
  const family = pack.namePool.family[Math.floor(rng() * pack.namePool.family.length)];
  return `${given} ${family}`;
}

function startingStats(country: Country, region: Region | null, family: Family, sex: Sex, health: number): Stats {
  const wealthBase = (family.incomeDecile - 1) * (100 / 9);
  const wealth = clamp(Math.round(wealthBase + (region?.wealthModifier ?? 0) * 100), 0, 100);
  const bonds = clamp(
    50 + (family.parentsAlive.mother ? 5 : 0) + (family.parentsAlive.father ? 5 : 0) + family.siblings * 2,
    0,
    85,
  );
  const pack = getTradition(family.traditionPackId);
  const genderPenalty = sex === 'female' ? pack.norms.genderEducationGap * 15 : 0;
  const standing = clamp(Math.round(family.incomeDecile * 8 - genderPenalty), 0, 100);
  return { health, wealth, education: 0, bonds, standing };
}

export function generateCharacter(seed: string, rng: RngFn, options: BirthOptions): BirthResult {
  const country =
    options.mode === 'random' ? pickCountry(rng) : getCountry(options.countryIso3 ?? pickCountry(rng).iso3);

  let region: Region | null;
  if (options.mode === 'region' && options.regionId) {
    region = getRegion(options.regionId);
  } else {
    region = pickRegion(rng, country);
  }

  const sex = pickSex(rng, country);
  const family = pickFamily(rng, country, region);
  const health = pickStartingHealth(rng, country, family);
  const name = pickName(rng, sex, family.traditionPackId);
  const stats = startingStats(country, region, family, sex, health);
  const rarity = computeRarity(country, region, sex, family, options.mode);

  const character: Character = {
    seed,
    name,
    sex,
    birthYear: new Date().getUTCFullYear(),
    countryIso3: country.iso3,
    regionId: region?.id ?? null,
    family,
    stats,
    ageYears: 0,
    alive: true,
    traits: [],
    activeMortalityModifiers: [],
    manualSelection: options.mode,
  };

  return { character, country, region, rarity };
}
