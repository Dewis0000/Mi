import { describe, expect, it } from 'vitest';
import { buildCumulative, clamp, createRng, samplePoisson, sampleBeta, weightedIndex } from './rng';

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng('seed-one');
    const b = createRng('seed-one');
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = createRng('seed-one');
    const b = createRng('seed-two');
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('stays within [0, 1)', () => {
    const rng = createRng('range-check');
    for (let i = 0; i < 5000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('weightedIndex / buildCumulative', () => {
  it('respects weight proportions over many draws', () => {
    const weights = [1, 3, 6];
    const cumulative = buildCumulative(weights);
    const total = cumulative[cumulative.length - 1];
    const rng = createRng('weighted-check');
    const counts = [0, 0, 0];
    const n = 50_000;
    for (let i = 0; i < n; i++) {
      counts[weightedIndex(cumulative, total, rng())]++;
    }
    expect(counts[0] / n).toBeCloseTo(0.1, 1);
    expect(counts[1] / n).toBeCloseTo(0.3, 1);
    expect(counts[2] / n).toBeCloseTo(0.6, 1);
  });
});

describe('samplePoisson', () => {
  it('has the right mean over many draws', () => {
    const rng = createRng('poisson-check');
    const lambda = 2.4;
    let sum = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) sum += samplePoisson(rng, lambda);
    expect(sum / n).toBeCloseTo(lambda, 1);
  });
});

describe('sampleBeta', () => {
  it('stays within [0, 1] and respects the mean a/(a+b)', () => {
    const rng = createRng('beta-check');
    const alpha = 2.1;
    const beta = 5.5;
    let sum = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const v = sampleBeta(rng, alpha, beta);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      sum += v;
    }
    expect(sum / n).toBeCloseTo(alpha / (alpha + beta), 1);
  });
});

describe('clamp', () => {
  it('clamps to range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
