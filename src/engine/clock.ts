// Движок времени (раздел 8): растягивает бюджет реального времени сессии на
// всю жизнь персонажа, с разной плотностью по возрастным этапам.

import type { ClockState, GameSpeed, SessionLength } from '../types';
import { clamp } from './rng';

export const SESSION_SECONDS: Record<SessionLength, number> = {
  short: 10 * 60,
  normal: 30 * 60,
  long: 90 * 60,
};

interface Stage {
  min: number;
  max: number;
  mult: number;
}

const STAGE_TABLE: Stage[] = [
  { min: 0, max: 2, mult: 0.8 },
  { min: 3, max: 11, mult: 0.5 },
  { min: 12, max: 17, mult: 1.6 },
  { min: 18, max: 29, mult: 1.8 },
  { min: 30, max: 49, mult: 1.0 },
  { min: 50, max: 69, mult: 0.8 },
  { min: 70, max: 130, mult: 1.3 },
];

export function stageMultiplier(age: number): number {
  const stage = STAGE_TABLE.find((s) => age >= s.min && age <= s.max);
  return stage?.mult ?? 1;
}

/**
 * Коэффициент нормировки k такой, что сумма k·stageMultiplier(age) по всем
 * годам ожидаемой жизни равна самой ожидаемой жизни — иначе из-за того, что
 * коэффициенты этапов не усредняются к 1, сумма бюджета разъехалась бы с
 * sessionSeconds.
 */
export function computeNormalization(expectedLifespan: number): number {
  let sum = 0;
  const wholeYears = Math.floor(expectedLifespan);
  for (let age = 0; age < wholeYears; age++) {
    sum += stageMultiplier(age);
  }
  const fractional = expectedLifespan - wholeYears;
  if (fractional > 0) sum += stageMultiplier(wholeYears) * fractional;
  return sum > 0 ? expectedLifespan / sum : 1;
}

export function createClockState(length: SessionLength, expectedLifespan: number): ClockState {
  const sessionSeconds = SESSION_SECONDS[length];
  return {
    phaseStartedAt: null,
    sessionSeconds,
    secondsElapsed: 0,
    secondsPerYearBase: sessionSeconds / Math.max(expectedLifespan, 1),
    expectedLifespan,
    speed: 1,
    paused: false,
    paceAdjustment: 1,
    acceleratedRemainder: false,
    lastTickAt: null,
    accumulatorMs: 0,
  };
}

/** Сколько реальных секунд должен идти конкретный игровой год при текущем темпе. */
export function secondsForYear(clock: ClockState, age: number): number {
  const normalization = computeNormalization(clock.expectedLifespan);
  const base = clock.secondsPerYearBase * normalization * stageMultiplier(age) * clock.paceAdjustment;
  const speedDivisor = clock.acceleratedRemainder ? 4 : clock.speed;
  return Math.max(base / speedDivisor, 0.05);
}

/**
 * Подстройка на ходу (каждые 5 игровых лет): сравнивает оставшийся бюджет с
 * оставшимся ожидаемым сроком и ускоряет темп максимум вдвое от базового.
 */
export function recalibratePace(clock: ClockState, currentAge: number): ClockState {
  const remainingBudget = Math.max(clock.sessionSeconds - clock.secondsElapsed, 0);
  const remainingExpected = Math.max(clock.expectedLifespan - currentAge, 0.1);
  const neededRatio = remainingBudget / (clock.secondsPerYearBase * remainingExpected || 1);
  const paceAdjustment = clamp(neededRatio, 0.4, 2);
  return { ...clock, paceAdjustment };
}

export function shouldEnterAcceleratedRemainder(clock: ClockState): boolean {
  return !clock.acceleratedRemainder && clock.secondsElapsed >= clock.sessionSeconds;
}

export function setSpeed(clock: ClockState, speed: GameSpeed): ClockState {
  return { ...clock, speed };
}

export function setPaused(clock: ClockState, paused: boolean): ClockState {
  return { ...clock, paused };
}
