/**
 * Poker hand evaluator for 5, 6 or 7 cards (best five-card hand).
 *
 * Returns a single integer score: higher is better, equal means a split.
 *   score = category << 20 | r1 << 16 | r2 << 12 | r3 << 8 | r4 << 4 | r5
 * where r1..r5 are the ranks that decide ties, most significant first.
 *
 * It works directly on rank counts and bitmasks (no 21-combination loop),
 * so it is fast enough to run tens of thousands of simulations per second
 * on a phone for the bots and the odds helper.
 */
import { type Card, rankOf, suitOf, RANK_NAMES, rankChar } from './cards';

export enum HandCategory {
  HighCard = 0,
  OnePair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
}

export const CATEGORY_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'High Card',
  [HandCategory.OnePair]: 'One Pair',
  [HandCategory.TwoPair]: 'Two Pair',
  [HandCategory.ThreeOfAKind]: 'Three of a Kind',
  [HandCategory.Straight]: 'Straight',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full House',
  [HandCategory.FourOfAKind]: 'Four of a Kind',
  [HandCategory.StraightFlush]: 'Straight Flush',
};

function pack(cat: HandCategory, ranks: number[]): number {
  let s = cat;
  for (let i = 0; i < 5; i++) s = (s << 4) | (ranks[i] ?? 0);
  return s;
}

/** Highest straight in a rank bitmask (bit r set = rank r present), or 0. */
function straightHigh(mask: number): number {
  if (mask & (1 << 14)) mask |= 1 << 1; // ace plays low in A-2-3-4-5
  for (let high = 14; high >= 5; high--) {
    if (((mask >> (high - 4)) & 0x1f) === 0x1f) return high;
  }
  return 0;
}

/** Top `n` ranks from a bitmask, descending. */
function topRanks(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let r = 14; r >= 2 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

export function evaluate(cards: readonly Card[]): number {
  const n = cards.length;
  if (n < 5 || n > 7) throw new Error(`evaluate() needs 5-7 cards, got ${n}`);

  const counts = new Array<number>(15).fill(0);
  const suitMasks = [0, 0, 0, 0];
  const suitCounts = [0, 0, 0, 0];
  let rankMask = 0;
  for (const c of cards) {
    const r = rankOf(c);
    const s = suitOf(c);
    counts[r]!++;
    suitMasks[s]! |= 1 << r;
    suitCounts[s]!++;
    rankMask |= 1 << r;
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCounts[s]! >= 5) flushSuit = s;

  if (flushSuit >= 0) {
    const sf = straightHigh(suitMasks[flushSuit]!);
    if (sf) return pack(HandCategory.StraightFlush, [sf]);
  }

  // Group ranks by multiplicity, highest rank first.
  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  const singles: number[] = [];
  for (let r = 14; r >= 2; r--) {
    const c = counts[r]!;
    if (c === 4) quads.push(r);
    else if (c === 3) trips.push(r);
    else if (c === 2) pairs.push(r);
    else if (c === 1) singles.push(r);
  }

  if (quads.length) {
    const q = quads[0]!;
    return pack(HandCategory.FourOfAKind, [q, topRanks(rankMask & ~(1 << q), 1)[0]!]);
  }

  if (trips.length && (trips.length > 1 || pairs.length)) {
    const t = trips[0]!;
    const p = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    return pack(HandCategory.FullHouse, [t, p]);
  }

  if (flushSuit >= 0) return pack(HandCategory.Flush, topRanks(suitMasks[flushSuit]!, 5));

  const st = straightHigh(rankMask);
  if (st) return pack(HandCategory.Straight, [st]);

  if (trips.length) {
    const t = trips[0]!;
    return pack(HandCategory.ThreeOfAKind, [t, ...topRanks(rankMask & ~(1 << t), 2)]);
  }

  if (pairs.length >= 2) {
    const [p1, p2] = [pairs[0]!, pairs[1]!];
    const kicker = topRanks(rankMask & ~(1 << p1) & ~(1 << p2), 1)[0]!;
    return pack(HandCategory.TwoPair, [p1, p2, kicker]);
  }

  if (pairs.length === 1) {
    const p = pairs[0]!;
    return pack(HandCategory.OnePair, [p, ...topRanks(rankMask & ~(1 << p), 3)]);
  }

  return pack(HandCategory.HighCard, singles.slice(0, 5));
}

export const categoryOf = (score: number): HandCategory => (score >> 20) as HandCategory;

function scoreRanks(score: number): number[] {
  return [16, 12, 8, 4, 0].map((sh) => (score >> sh) & 0xf);
}

/** Human-readable description, e.g. "Full House, Kings full of Sevens". */
export function describeScore(score: number): string {
  const cat = categoryOf(score);
  const [a = 0, b = 0, c = 0] = scoreRanks(score);
  const one = (r: number) => RANK_NAMES[r]![0];
  const many = (r: number) => RANK_NAMES[r]![1];
  switch (cat) {
    case HandCategory.StraightFlush:
      return a === 14 ? 'Royal Flush' : `Straight Flush, ${one(a)} high`;
    case HandCategory.FourOfAKind: return `Four of a Kind, ${many(a)}`;
    case HandCategory.FullHouse: return `Full House, ${many(a)} full of ${many(b)}`;
    case HandCategory.Flush: return `Flush, ${one(a)} high`;
    case HandCategory.Straight: return `Straight, ${one(a)} high`;
    case HandCategory.ThreeOfAKind: return `Three of a Kind, ${many(a)}`;
    case HandCategory.TwoPair: return `Two Pair, ${many(a)} and ${many(b)}`;
    case HandCategory.OnePair: return `Pair of ${many(a)}`;
    default: return `High Card, ${one(a)}` + (b ? ` (${rankChar(b)}${c ? rankChar(c) : ''} kicker)` : '');
  }
}

export function describeHand(cards: readonly Card[]): string {
  return describeScore(evaluate(cards));
}
