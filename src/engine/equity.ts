/**
 * Monte Carlo equity: "how often does this hand win if we deal out the rest
 * many times?" Used by the odds helper and by stronger bots.
 */
import { type Card, fullDeck } from './cards';
import { type Rng, createRng } from './rng';
import { evaluate, categoryOf } from './evaluator';

export interface EquityOptions {
  /** Our two hole cards. */
  hole: readonly Card[];
  /** Community cards dealt so far (0, 3, 4 or 5). */
  board?: readonly Card[];
  /** Number of opponents still in the hand (holding unknown random cards). */
  opponents: number;
  /** Other cards known not to be in the deck. */
  dead?: readonly Card[];
  iterations?: number;
  rng?: Rng;
}

export interface EquityResult {
  win: number;
  tie: number;
  lose: number;
  /** win + tie share: the fraction of the pot we expect to get. */
  equity: number;
  iterations: number;
  /**
   * How often we finish with each hand category by the river, indexed by
   * HandCategory (0 = high card … 8 = straight flush). Fractions summing to 1.
   */
  categories: number[];
}

export function estimateEquity(opts: EquityOptions): EquityResult {
  const board = opts.board ?? [];
  const iterations = opts.iterations ?? 2000;
  const rng = opts.rng ?? createRng();
  const used = new Set<Card>([...opts.hole, ...board, ...(opts.dead ?? [])]);
  const stub = fullDeck().filter((c) => !used.has(c));
  const need = 5 - board.length + opts.opponents * 2;
  if (opts.opponents < 1) throw new Error('Need at least one opponent');
  if (need > stub.length) throw new Error('Not enough cards left in deck');

  let win = 0;
  let tie = 0;
  let share = 0;
  const cats = new Array<number>(9).fill(0);
  const deck = stub.slice();
  const fullBoard: Card[] = [...board];
  const hand7: Card[] = new Array(7);

  for (let it = 0; it < iterations; it++) {
    // Partial Fisher–Yates: only shuffle the cards we need.
    for (let i = 0; i < need; i++) {
      const j = i + rng.int(deck.length - i);
      const t = deck[i]!;
      deck[i] = deck[j]!;
      deck[j] = t;
    }
    let k = 0;
    fullBoard.length = board.length;
    while (fullBoard.length < 5) fullBoard.push(deck[k++]!);

    hand7[0] = opts.hole[0]!;
    hand7[1] = opts.hole[1]!;
    for (let i = 0; i < 5; i++) hand7[i + 2] = fullBoard[i]!;
    const mine = evaluate(hand7);
    cats[categoryOf(mine)]!++;

    let best = 0;
    let bestCount = 0;
    for (let o = 0; o < opts.opponents; o++) {
      hand7[0] = deck[k++]!;
      hand7[1] = deck[k++]!;
      const s = evaluate(hand7);
      if (s > best) {
        best = s;
        bestCount = 1;
      } else if (s === best) bestCount++;
    }
    if (mine > best) {
      win++;
      share += 1;
    } else if (mine === best) {
      tie++;
      share += 1 / (bestCount + 1);
    }
  }

  return {
    win: win / iterations,
    tie: tie / iterations,
    lose: (iterations - win - tie) / iterations,
    equity: share / iterations,
    iterations,
    categories: cats.map((c) => c / iterations),
  };
}

/** Pot odds: the equity a call needs to break even. */
export function potOdds(callAmount: number, potBeforeCall: number): number {
  return callAmount <= 0 ? 0 : callAmount / (potBeforeCall + callAmount);
}
