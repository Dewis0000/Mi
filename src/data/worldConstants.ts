// Приблизительные ориентиры для счётчика населения Земли на стартовом экране
// и в панели аналитики. Это иллюстративные данные ("стартовое значение из
// данных, прибавка примерно 2,3 человека в секунду" — раздел 4 спецификации),
// а не сверенная со статагентствами величина.

export const WORLD_BIRTHS_PER_SECOND = 4.3;
export const WORLD_DEATHS_PER_SECOND = 2.0;
export const WORLD_NET_GROWTH_PER_SECOND = WORLD_BIRTHS_PER_SECOND - WORLD_DEATHS_PER_SECOND;

// Базовая точка отсчёта: приблизительная оценка населения Земли на эту дату.
export const WORLD_POPULATION_BASELINE = 8_250_000_000;
export const WORLD_POPULATION_BASELINE_AT = Date.UTC(2026, 0, 1);

export function worldPopulationNow(now: number = Date.now()): number {
  const secondsElapsed = (now - WORLD_POPULATION_BASELINE_AT) / 1000;
  return Math.round(WORLD_POPULATION_BASELINE + secondsElapsed * WORLD_NET_GROWTH_PER_SECOND);
}
