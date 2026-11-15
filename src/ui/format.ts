import { type Card, rankOf, suitOf, RANK_NAMES } from '../engine/cards';
import { describeHand } from '../engine/evaluator';

export const chips = (n: number) => n.toLocaleString('en-US');

/** "Pocket Kings", "Ace-King suited" before the flop; "Two Pair, …" after. */
export function heroHandText(hole: readonly Card[], board: readonly Card[]): string {
  if (hole.length < 2) return '';
  if (board.length >= 3) return describeHand([...hole, ...board]);
  const [a, b] = hole as [Card, Card];
  const r1 = Math.max(rankOf(a), rankOf(b));
  const r2 = Math.min(rankOf(a), rankOf(b));
  if (r1 === r2) return `Pocket ${RANK_NAMES[r1]![1]}`;
  return `${RANK_NAMES[r1]![0]}-${RANK_NAMES[r2]![0]} ${suitOf(a) === suitOf(b) ? 'suited' : 'offsuit'}`;
}
