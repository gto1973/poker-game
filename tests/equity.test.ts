import { describe, it, expect } from 'vitest';
import { estimateEquity, potOdds } from '../src/engine/equity';
import { parseCards } from '../src/engine/cards';
import { createRng } from '../src/engine/rng';

describe('estimateEquity', () => {
  it('AA vs one random hand is about 85%', () => {
    const r = estimateEquity({ hole: parseCards('As Ah'), opponents: 1, iterations: 20000, rng: createRng(1) });
    expect(r.equity).toBeGreaterThan(0.83);
    expect(r.equity).toBeLessThan(0.87);
  });

  it('72o vs one random hand is about 35%', () => {
    const r = estimateEquity({ hole: parseCards('7c 2d'), opponents: 1, iterations: 20000, rng: createRng(2) });
    expect(r.equity).toBeGreaterThan(0.32);
    expect(r.equity).toBeLessThan(0.38);
  });

  it('equity drops with more opponents', () => {
    const one = estimateEquity({ hole: parseCards('Ks Kh'), opponents: 1, iterations: 10000, rng: createRng(3) });
    const five = estimateEquity({ hole: parseCards('Ks Kh'), opponents: 5, iterations: 10000, rng: createRng(3) });
    expect(five.equity).toBeLessThan(one.equity - 0.2);
  });

  it('made nuts on the river is 100%', () => {
    const r = estimateEquity({ hole: parseCards('As Ks'), board: parseCards('Qs Js Ts 2c 3d'), opponents: 3, iterations: 500 });
    expect(r.equity).toBe(1);
  });

  it('is fast enough for a phone', () => {
    const t = performance.now();
    estimateEquity({ hole: parseCards('Ah Kh'), opponents: 3, iterations: 20000, rng: createRng(4) });
    // Desktop CI is ~10x a phone; 20k sims in <1s here means a few thousand per bot decision is snappy on device.
    expect(performance.now() - t).toBeLessThan(1000);
  });
});

describe('potOdds', () => {
  it('calling 50 into 100 needs 33%', () => {
    expect(potOdds(50, 100)).toBeCloseTo(1 / 3);
  });
});
