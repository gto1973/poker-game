/**
 * Preflop hand strength using the Chen formula (Bill Chen's quick
 * scoring system). Scores run from about -1 (72o) to 20 (AA).
 * It's cheap, well known, and good enough for bots to pick starting hands.
 */
import { type Card, rankOf, suitOf } from '../engine/cards';

const HIGH_CARD_POINTS: Record<number, number> = { 14: 10, 13: 8, 12: 7, 11: 6 };

export function chenScore(hole: readonly Card[]): number {
  const [a, b] = hole as [Card, Card];
  const r1 = Math.max(rankOf(a), rankOf(b));
  const r2 = Math.min(rankOf(a), rankOf(b));
  const suited = suitOf(a) === suitOf(b);

  let score = HIGH_CARD_POINTS[r1] ?? r1 / 2;
  if (r1 === r2) return Math.max(5, score * 2);
  if (suited) score += 2;

  const gap = r1 - r2 - 1;
  score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && r1 < 12) score += 1; // connectors below Queen can make straights
  return Math.ceil(score);
}

/** Chen score mapped to 0..1 for convenience. */
export function preflopStrength(hole: readonly Card[]): number {
  return Math.min(1, Math.max(0, (chenScore(hole) + 1) / 21));
}

/** Short name like "AKs", "T9o", "QQ" – used by the log and the coach. */
export function handClass(hole: readonly Card[]): string {
  const [a, b] = hole as [Card, Card];
  const chars = '23456789TJQKA';
  const r1 = Math.max(rankOf(a), rankOf(b));
  const r2 = Math.min(rankOf(a), rankOf(b));
  const s = chars[r1 - 2]! + chars[r2 - 2]!;
  if (r1 === r2) return s;
  return s + (suitOf(a) === suitOf(b) ? 's' : 'o');
}
