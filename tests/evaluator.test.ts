import { describe, it, expect } from 'vitest';
import { parseCards, rankOf, suitOf, fullDeck, type Card } from '../src/engine/cards';
import { evaluate, categoryOf, describeHand, HandCategory } from '../src/engine/evaluator';
import { createRng, shuffle } from '../src/engine/rng';

const ev = (s: string) => evaluate(parseCards(s));
const cat = (s: string) => categoryOf(ev(s));

describe('evaluate: categories', () => {
  it.each([
    ['As Ks Qs Js Ts', HandCategory.StraightFlush],
    ['5h 4h 3h 2h Ah', HandCategory.StraightFlush],
    ['9c 9d 9h 9s 2c', HandCategory.FourOfAKind],
    ['Kc Kd Kh 7s 7c', HandCategory.FullHouse],
    ['2d 7d 9d Jd Kd', HandCategory.Flush],
    ['5c 6d 7h 8s 9c', HandCategory.Straight],
    ['Ac 2d 3h 4s 5c', HandCategory.Straight],
    ['Qc Qd Qh 3s 2c', HandCategory.ThreeOfAKind],
    ['Jc Jd 4h 4s Ac', HandCategory.TwoPair],
    ['Tc Td 8h 4s 2c', HandCategory.OnePair],
    ['Ac Jd 8h 4s 2c', HandCategory.HighCard],
  ])('%s', (hand, expected) => {
    expect(cat(hand)).toBe(expected);
  });

  it('picks the best 5 of 7', () => {
    expect(cat('As Ks 2d 3c Qs Js Ts')).toBe(HandCategory.StraightFlush);
    expect(cat('Ah Ad Ac As Kh Qh Jh')).toBe(HandCategory.FourOfAKind); // quads beat the flush draw
    expect(cat('Kh Kd Kc 7s 7c 7d 2h')).toBe(HandCategory.FullHouse); // two trips
    expect(cat('2h 3h 4h 5h 9h 6c 7c')).toBe(HandCategory.Flush); // flush beats straight
    expect(cat('Ah 2c 3d 4s 5h 6c Kd')).toBe(HandCategory.Straight);
  });
});

describe('evaluate: ordering and ties', () => {
  it('wheel straight is the lowest straight', () => {
    expect(ev('Ac 2d 3h 4s 5c')).toBeLessThan(ev('2c 3d 4h 5s 6c'));
    expect(ev('Tc Jd Qh Ks Ac')).toBeGreaterThan(ev('9c Td Jh Qs Kc'));
  });

  it('kickers decide', () => {
    expect(ev('Ac Ad Kh 7s 2c')).toBeGreaterThan(ev('Ah As Qh Js Tc'));
    expect(ev('Jc Jd 4h 4s Ac')).toBeGreaterThan(ev('Jh Js 4c 4d Kc'));
    expect(ev('Kc Kd Kh 2s 2c')).toBeGreaterThan(ev('Qc Qd Qh As Ac'));
  });

  it('board plays => tie', () => {
    const board = 'Ac Kd Qh Js Tc';
    expect(ev(`${board} 2c 3d`)).toBe(ev(`${board} 4h 5s`));
  });

  it('only five cards count', () => {
    // Sixth-best card must not break the tie.
    expect(ev('Ac Kd 9h 7s 5c 3d 2h')).toBe(ev('Ac Kd 9h 7s 5c 4d 3h'));
  });
});

describe('describeHand', () => {
  it.each([
    ['As Ks Qs Js Ts', 'Royal Flush'],
    ['Kc Kd Kh 7s 7c', 'Full House, Kings full of Sevens'],
    ['Jc Jd 4h 4s Ac', 'Two Pair, Jacks and Fours'],
    ['Tc Td 8h 4s 2c', 'Pair of Tens'],
    ['Ac 2d 3h 4s 5c', 'Straight, Five high'],
  ])('%s -> %s', (hand, text) => {
    expect(describeHand(parseCards(hand))).toBe(text);
  });
});

// ---- Cross-check against a slow, obviously-correct reference implementation.

function ref5(cards: Card[]): number[] {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]!));
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (ranks[0]! - ranks[4]! === 4) straightHigh = ranks[0]!;
    else if (ranks.join() === '14,5,4,3,2') straightHigh = 5;
  }
  const groups = uniq
    .map((r) => ({ r, n: ranks.filter((x) => x === r).length }))
    .sort((a, b) => b.n - a.n || b.r - a.r);
  const byGroup = groups.map((g) => g.r);
  const shape = groups.map((g) => g.n).join('');
  if (straightHigh && flush) return [8, straightHigh];
  if (shape === '41') return [7, ...byGroup];
  if (shape === '32') return [6, ...byGroup];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (shape === '311') return [3, ...byGroup];
  if (shape === '221') return [2, ...byGroup];
  if (shape === '2111') return [1, ...byGroup];
  return [0, ...ranks];
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

function refBest(cards: Card[]): number[] {
  let best: number[] = [-1];
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      const five = cards.filter((_, i) => i !== a && i !== b);
      const s = ref5(five);
      if (cmp(s, best) > 0) best = s;
    }
  return best;
}

describe('evaluate vs reference (random 7-card hands)', () => {
  it('agrees on category and pairwise ordering for 20k hands', () => {
    const rng = createRng(12345);
    for (let i = 0; i < 20000; i++) {
      const deck = shuffle(fullDeck(), rng);
      const h1 = deck.slice(0, 7);
      const h2 = deck.slice(7, 14);
      const r1 = refBest(h1);
      const r2 = refBest(h2);
      const e1 = evaluate(h1);
      const e2 = evaluate(h2);
      expect(categoryOf(e1)).toBe(r1[0]);
      expect(Math.sign(e1 - e2)).toBe(cmp(r1, r2));
    }
  });
});
