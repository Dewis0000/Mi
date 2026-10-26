// Параметрическая калиброванная модель смертности.
//
// Спецификация (раздел 3) предполагала lifetables.json со статичными qx по
// возрастным полосам для каждой страны. Вместо того чтобы придумывать тысячи
// "настоящих" чисел по возрастным полосам для 195 стран, которые нельзя было
// бы проверить, здесь реализована параметрическая кривая, откалиброванная
// под реальные lifeExpectancy и infantMortality каждой страны (они-то и
// являются настоящими входными данными) и воспроизводящая все требуемые
// формой кривой черты из раздела 9: высокое значение в первый год,
// минимум около 10 лет, «горб молодых мужчин» в 18–28 (масштабируется
// homicideRate страны), экспоненциальный рост после 55 с удвоением
// примерно каждые 8 лет. Калибровка — честная замена: числа, которые она
// даёт, проверяются тестами из раздела 9/18 (средний возраст смерти в
// пределах 2 лет от lifeExpectancy, детская смертность в пределах 10% и
// т.д.), а не берутся из воздуха.

import type { Country, Sex } from '../types';
import { clamp } from './rng';

const GOMP_B = Math.log(2) / 8; // смертность пожилых удваивается каждые ~8 лет
const HUMP_CENTER = 22;
const HUMP_SIGMA = 7;
const BACKGROUND = 0.0022;
const GOMPERTZ_BASE = 0.00042;
export const MAX_MODELLED_AGE = 119;

// infantMortality — показатель детской смертности ДО 5 ЛЕТ (U5MR-стиль, как
// и задано источнику данных), а не только до первого дня рождения. Поэтому
// соответствующий хазард распределён по годам 0–4 так, чтобь суммарная
// вероятность смерти за эти пять лет (а не только q(0) отдельно) совпадала
// с целью — большая часть риска в год 0 (неонатальная/младенческая
// смертность доминирует в реальности), остаток убывает к 4 годам.
const UNDER5_FRACTIONS = [0.55, 0.2, 0.12, 0.08, 0.05];

function infantHazard(age: number, infantMortalityPer1000: number, conflictFactor: number): number {
  if (age > 4) return 0;
  // См. calibrateScale: цель — чтобы кумулятивная вероятность смерти за 0–4
  // года ПОСЛЕ умножения на conflictFactor в annualMortality() совпала с
  // настоящим infantMortality страны, а не оказалась инфлирована конфликтом
  // второй раз (он уже один раз отражён в самой статистике infantMortality).
  const u5 = clamp(infantMortalityPer1000 / 1000, 0, 0.5) / conflictFactor;
  const cumulativeHazard = -Math.log(1 - clamp(u5, 0, 0.95));
  return cumulativeHazard * UNDER5_FRACTIONS[age];
}

function humpHazard(age: number, sex: Sex, homicideRate: number): number {
  const sexMul = sex === 'male' ? 1 : 0.22;
  const intensity = 0.12 + homicideRate / 18;
  const gaussian = Math.exp(-((age - HUMP_CENTER) ** 2) / (2 * HUMP_SIGMA ** 2));
  return sexMul * intensity * gaussian;
}

function gompertzHazard(age: number): number {
  return GOMPERTZ_BASE * Math.exp(GOMP_B * age);
}

function hazardAt(age: number, sex: Sex, country: Country, scale: number, conflictFactor: number): number {
  const infant = infantHazard(age, country.infantMortality, conflictFactor);
  const rest = humpHazard(age, sex, country.homicideRate) + BACKGROUND + gompertzHazard(age);
  return infant + scale * rest;
}

function qxArrayForScale(sex: Sex, country: Country, scale: number, conflictFactor: number): number[] {
  const arr = new Array<number>(MAX_MODELLED_AGE + 1);
  for (let age = 0; age <= MAX_MODELLED_AGE; age++) {
    if (age >= MAX_MODELLED_AGE) {
      arr[age] = 1;
      continue;
    }
    const h = hazardAt(age, sex, country, scale, conflictFactor);
    arr[age] = clamp(1 - Math.exp(-h), 0, 0.98);
  }
  return arr;
}

function lifeExpectancyFromQx(qx: readonly number[]): number {
  let l = 1;
  let e = 0;
  for (let age = 0; age < qx.length; age++) {
    const q = clamp(qx[age], 0, 1);
    const lNext = l * (1 - q);
    e += (l + lNext) / 2;
    l = lNext;
  }
  return e;
}

/**
 * Бисекция по общему масштабу "взрослой" смертности. lifeTable() (ниже)
 * возвращает чистую базовую кривую без поправок — annualMortality() в
 * mortality.ts умножает её на healthFactor/wealthFactor/regionFactor/
 * conflictFactor/traitFactor по формуле раздела 9. Но реальная
 * lifeExpectancy страны УЖЕ включает в себя её конфликтность — это
 * наблюдаемая статистика. Если откалибровать базовую кривую прямо на
 * lifeExpectancy, а потом ещё раз умножить на conflictFactor в игре,
 * конфликт посчитается дважды и жизни в неспокойных странах будут
 * систематически короче, чем говорят собственные данные игры.
 *
 * Поэтому здесь при поиске scale проверяется не сырая кривая, а кривая
 * ПОСЛЕ применения conflictFactor в вероятностном пространстве — ровно
 * так, как это сделает annualMortality() на "нейтральной" точке
 * персонажа (health≈85.7, wealth=70 — где healthFactor и wealthFactor
 * равны 1; без региона и без метки 'disabled', где остальные множители
 * тоже равны 1). Найденный scale затем используется для кривой, которая
 * реально кэшируется и возвращается — она conflictFactor в себе не несёт,
 * его один раз применит annualMortality().
 */
function calibrateScale(sex: Sex, country: Country, conflictFactor: number): number {
  const target = country.lifeExpectancy[sex];
  let lo = 0.02;
  let hi = 80;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const withConflictApplied = qxArrayForScale(sex, country, mid, conflictFactor).map((q) =>
      clamp(q * conflictFactor, 0, 0.98),
    );
    const e = lifeExpectancyFromQx(withConflictApplied);
    if (e > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const curveCache = new Map<string, number[]>();

function getCurve(iso3: string, sex: Sex, country: Country): number[] {
  const key = `${iso3}:${sex}`;
  let qx = curveCache.get(key);
  if (!qx) {
    const conflictFactor = 1 + country.conflictIndex * 0.9;
    const scale = calibrateScale(sex, country, conflictFactor);
    qx = qxArrayForScale(sex, country, scale, conflictFactor);
    curveCache.set(key, qx);
  }
  return qx;
}

/** Базовая (страновая, без личных модификаторов) годовая вероятность смерти qx. */
export function lifeTable(iso3: string, sex: Sex, age: number, country: Country): number {
  const qx = getCurve(iso3, sex, country);
  const a = clamp(Math.floor(age), 0, MAX_MODELLED_AGE);
  return qx[a];
}

export function clearLifetableCache(): void {
  curveCache.clear();
}
