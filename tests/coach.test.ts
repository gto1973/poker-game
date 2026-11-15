import { describe, it, expect } from 'vitest';
import { preflopTier, preflopAdvice, coach } from '../src/coach/coach';
import { parseCards } from '../src/engine/cards';
import { HandCategory } from '../src/engine/evaluator';

const tier = (s: string) => preflopTier(parseCards(s));

describe('preflop tiers', () => {
  it.each([
    ['As Ah', 'premium'], ['Kc Kd', 'premium'], ['As Ks', 'premium'], ['Jh Jd', 'premium'],
    ['Ah Kd', 'strong'], ['Th Td', 'strong'], ['Ks Qs', 'strong'], ['Ah Qh', 'strong'],
    ['9c 9d', 'playable'], ['Jh Th', 'playable'], ['Ac Qd', 'playable'],
    ['2c 2d', 'speculative'], ['7h 6h', 'speculative'], ['As 5s', 'speculative'],
    ['7c 2d', 'weak'], ['Kh 4c', 'weak'], ['9s 3d', 'weak'],
  ])('%s is %s', (hand, expected) => {
    expect(tier(hand)).toBe(expected);
  });

  it('advice depends on position and raises', () => {
    expect(preflopAdvice('speculative', 'UTG', false)).toMatch(/fold/i);
    expect(preflopAdvice('speculative', 'BTN', false)).toMatch(/late position/i);
    expect(preflopAdvice('premium', 'UTG', true)).toMatch(/re-raise/i);
  });
});

describe('coach', () => {
  const base = { opponents: 1, callAmount: 0, pot: 30, position: 'BTN', facingRaise: false, seed: 1 };

  it('rates preflop hands and gives win chance', () => {
    const c = coach({ ...base, hole: parseCards('As Ad'), board: [] });
    expect(c.tier).toBe('premium');
    expect(c.equity.equity).toBeGreaterThan(0.8);
  });

  it('pot odds verdict: flush draw facing a small vs a big bet on the turn', () => {
    const hole = parseCards('Ah 5h');
    const board = parseCards('Kh 9h 2c 7s');
    const small = coach({ ...base, hole, board, callAmount: 20, pot: 120 });
    const big = coach({ ...base, opponents: 3, hole, board, callAmount: 300, pot: 400 });
    expect(small.needed).toBeCloseTo(20 / 140);
    expect(small.callVerdict).toBe('good');
    expect(big.callVerdict).toBe('bad');
  });

  it('shows chances to improve before the river, and current hand', () => {
    const c = coach({ ...base, hole: parseCards('Ah 5h'), board: parseCards('Kh 9h 2c') });
    const flush = c.improve.find((x) => x.category === HandCategory.Flush)!;
    expect(flush.chance).toBeGreaterThan(0.3);
    expect(flush.chance).toBeLessThan(0.4);
    expect(c.madeCategory).toBe(HandCategory.HighCard);
  });

  it('no improvement list on the river', () => {
    const c = coach({ ...base, hole: parseCards('Ah 5h'), board: parseCards('Kh 9h 2c 7s 3d') });
    expect(c.improve).toEqual([]);
  });
});

describe('coach headlines', () => {
  const base = { opponents: 1, callAmount: 0, pot: 60, position: 'BTN', facingRaise: false, seed: 3 };
  it('top pair heads-up is called strong', () => {
    const c = coach({ ...base, hole: parseCards('Jh Th'), board: parseCards('Jc 7d 2s') });
    expect(c.headline).toMatch(/Strong/);
  });
  it('flush draw is recognised as a drawing hand', () => {
    const c = coach({ ...base, opponents: 3, hole: parseCards('8h 6h'), board: parseCards('Ah Kh 2c') });
    expect(c.headline).toMatch(/Drawing hand/);
  });
});
