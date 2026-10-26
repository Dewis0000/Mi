// Детерминированный генератор случайных чисел и распределения на его основе.
// Во всём каталоге engine/ не используется встроенный недетерминированный
// генератор платформы — см. критерий приёмки в разделе 18 спецификации.

export type RngFn = () => number;

function xmur3(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function mulberry32(seed: number): RngFn {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Один сид-строка → один детерминированный поток чисел. */
export function createRng(seed: string): RngFn {
  const seeder = xmur3(seed);
  return mulberry32(seeder());
}

export function buildCumulative(weights: readonly number[]): number[] {
  const out = new Array<number>(weights.length);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    out[i] = acc;
  }
  return out;
}

/** Бинарный поиск по кумулятивному массиву весов. total — последний элемент cumulative. */
export function weightedIndex(cumulative: readonly number[], total: number, roll: number): number {
  if (cumulative.length === 0) return -1;
  const target = roll * total;
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cumulative[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function weightedPick<T>(items: readonly T[], weights: readonly number[], rng: RngFn): T {
  const cumulative = buildCumulative(weights);
  const total = cumulative[cumulative.length - 1];
  if (!total || total <= 0) return items[Math.floor(rng() * items.length)];
  const idx = weightedIndex(cumulative, total, rng());
  return items[idx];
}

/** Gamma(shape, 1) через Marsaglia–Tsang; для shape<1 — через boost-трюк Ahrens–Dieter. */
export function sampleGamma(rng: RngFn, shape: number): number {
  if (shape < 1) {
    const g = sampleGamma(rng, shape + 1);
    const u = Math.max(rng(), 1e-12);
    return g * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      const u1 = Math.max(rng(), 1e-12);
      const u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.max(rng(), 1e-12);
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) {
      return d * v;
    }
  }
}

export function sampleBeta(rng: RngFn, alpha: number, beta: number): number {
  const x = sampleGamma(rng, alpha);
  const y = sampleGamma(rng, beta);
  return x / (x + y);
}

/** Пуассон через алгоритм Кнута. */
export function samplePoisson(rng: RngFn, lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

/** Равномерный джиттер в диапазоне [-amplitude, +amplitude]. */
export function jitter(rng: RngFn, amplitude: number): number {
  return (rng() * 2 - 1) * amplitude;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
