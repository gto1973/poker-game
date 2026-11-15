/**
 * The coach: turns the situation the human can see (own cards, board, pot,
 * bets, number of opponents) into ratings and plain-English advice.
 *
 * It never looks at opponents' hole cards. Win chances assume each
 * opponent holds random cards.
 */
import type { Card } from '../engine/cards';
import { estimateEquity, potOdds, type EquityResult } from '../engine/equity';
import { HandCategory, CATEGORY_NAMES, evaluate, categoryOf } from '../engine/evaluator';
import { createRng } from '../engine/rng';
import { chenScore, handClass } from '../ai/preflop';

// ------------------------------------------------------------ preflop tiers

export type Tier = 'premium' | 'strong' | 'playable' | 'speculative' | 'weak';

export const TIER_INFO: Record<Tier, { label: string; color: string; summary: string }> = {
  premium: { label: 'Premium', color: '#3fcf8e', summary: 'Top ~3% of hands. Always raise.' },
  strong: { label: 'Strong', color: '#9ad64b', summary: 'Raise from any position.' },
  playable: { label: 'Playable', color: '#f2c14e', summary: 'Good hand, best in late position.' },
  speculative: { label: 'Speculative', color: '#f08c3a', summary: 'Play cheaply, hoping to hit big (set, straight, flush).' },
  weak: { label: 'Weak', color: '#e5484d', summary: 'Usually fold.' },
};

export const TIER_ORDER: Tier[] = ['premium', 'strong', 'playable', 'speculative', 'weak'];

/** Starting-hand tier from the Chen formula, with small pairs promoted to speculative. */
export function tierFromScore(score: number, isPair: boolean): Tier {
  if (score >= 12) return 'premium';
  if (score >= 10) return 'strong';
  if (score >= 8) return 'playable';
  if (score >= 6 || isPair) return 'speculative';
  return 'weak';
}

export function preflopTier(hole: readonly Card[]): Tier {
  const cls = handClass(hole);
  return tierFromScore(chenScore(hole), cls.length === 2);
}

export type PositionGroup = 'early' | 'late' | 'blinds';

export function positionGroup(pos: string): PositionGroup {
  if (pos === 'SB' || pos === 'BB') return 'blinds';
  if (pos === 'CO' || pos === 'BTN') return 'late';
  return 'early';
}

const POSITION_NAMES: Record<string, string> = {
  BTN: 'on the button (best seat: you act last after the flop)',
  CO: 'in the cutoff (late position)',
  HJ: 'in the hijack (middle position)',
  MP: 'in middle position',
  UTG: 'under the gun (first to act: worst position)',
  SB: 'in the small blind',
  BB: 'in the big blind',
};

export function preflopAdvice(tier: Tier, pos: string, facingRaise: boolean): string {
  const g = positionGroup(pos);
  if (facingRaise) {
    switch (tier) {
      case 'premium': return 'Someone raised: re-raise (3-bet). This hand is strong enough to build a big pot.';
      case 'strong': return 'Someone raised: call, or re-raise with the best of these (TT, AK).';
      case 'playable': return g === 'late' || pos === 'BB'
        ? 'Facing a raise: a call is OK in position, but fold to big re-raises.'
        : 'Facing a raise: usually fold from here. Raisers often have better.';
      case 'speculative': return 'Facing a raise: fold most of the time unless it is cheap and many players are in.';
      case 'weak': return 'Fold. Not worth a raise.';
    }
  }
  switch (tier) {
    case 'premium': return 'Raise from any position. Don\'t just call — make them pay to see a flop.';
    case 'strong': return 'Raise from any position.';
    case 'playable': return g === 'early'
      ? 'Raise if nobody has yet, but be careful: many players still to act behind you.'
      : 'Raise. This is a good hand from late position or the blinds.';
    case 'speculative': return g === 'early'
      ? 'Usually fold from early position: too many players can raise after you.'
      : 'Playable from late position or the blinds if it\'s cheap. You\'re hoping to hit big.';
    case 'weak': return pos === 'BB' ? 'Weak hand. Check if you can for free, otherwise fold.' : 'Fold. Weak hands lose money in the long run.';
  }
}

export function positionDescription(pos: string): string {
  return POSITION_NAMES[pos] ?? `in ${pos}`;
}

// -------------------------------------------------------------- live coach

export interface CoachInput {
  hole: readonly Card[];
  board: readonly Card[];
  /** Opponents still in the hand. */
  opponents: number;
  /** Chips needed to call (0 = nothing to call). */
  callAmount: number;
  /** All chips in the middle including current bets. */
  pot: number;
  /** Human's position name (BTN, CO, …). */
  position: string;
  /** Someone has raised preflop (beyond the big blind). */
  facingRaise: boolean;
  /** Seed so numbers don't jitter on re-render. */
  seed: number;
}

export type Verdict = 'good' | 'bad' | 'neutral';

export interface Coaching {
  tier: Tier | null;
  tierAdvice: string | null;
  equity: EquityResult;
  /** Equity needed to call profitably, or null if nothing to call. */
  needed: number | null;
  callVerdict: Verdict;
  /** One-line advice for the strip. */
  headline: string;
  /** Longer explanation for the detail sheet. */
  explanation: string[];
  /** Chances to finish with each hand type by the river (only before the river). */
  improve: { name: string; chance: number; category: HandCategory }[];
  /** The hand you currently hold (after the flop). */
  madeCategory: HandCategory | null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function coach(input: CoachInput): Coaching {
  const { hole, board, opponents, callAmount, pot } = input;
  const iterations = board.length === 5 ? 2500 : 3000;
  const equity = estimateEquity({
    hole, board, opponents: Math.max(1, opponents), iterations, rng: createRng(input.seed),
  });
  const preflop = board.length === 0;
  const tier = preflop ? preflopTier(hole) : null;
  const tierAdvice = tier ? preflopAdvice(tier, input.position, input.facingRaise) : null;
  const madeCategory = preflop ? null : categoryOf(evaluate([...hole, ...board]));
  const needed = callAmount > 0 ? potOdds(callAmount, pot) : null;
  const fairShare = 1 / (Math.max(1, opponents) + 1);

  // "Strong" scales with the number of opponents: 75% heads-up, ~55% multiway.
  const strongBar = Math.min(0.75, Math.max(0.55, fairShare * 2));
  // Chance to finish with a straight or better (only counts if we don't already have one).
  const drawChance =
    madeCategory !== null && madeCategory < HandCategory.Straight
      ? equity.categories.slice(HandCategory.Straight).reduce((a, b) => a + b, 0)
      : 0;

  let callVerdict: Verdict = 'neutral';
  if (needed !== null) callVerdict = equity.equity >= needed ? 'good' : 'bad';

  const explanation: string[] = [];
  let headline: string;

  if (preflop) {
    headline = tierAdvice!;
  } else if (needed !== null) {
    headline = callVerdict === 'good'
      ? `Calling is profitable: you win ${pct(equity.equity)}, you need ${pct(needed)}.`
      : `Calling loses money long-term: you win ${pct(equity.equity)}, you need ${pct(needed)}.`;
  } else if (equity.equity >= strongBar) {
    headline = 'Strong hand: bet so worse hands pay you.';
  } else if (drawChance >= 0.25 && board.length < 5) {
    headline = `Drawing hand: ${pct(drawChance)} to make a straight or better by the river. Check, or bet sometimes as a semi-bluff.`;
  } else if (equity.equity >= fairShare * 1.2) {
    headline = 'Decent hand: a small bet or a check are both fine.';
  } else {
    headline = 'Weak right now: checking is fine. Bluff only occasionally.';
  }

  explanation.push(
    `Against ${opponents} opponent${opponents === 1 ? '' : 's'}, you win about ${pct(equity.equity)} of the time ` +
      `(${pct(equity.win)} outright, ${pct(equity.tie)} split). An average hand here would win ${pct(fairShare)}.`,
  );
  if (needed !== null) {
    explanation.push(
      `Pot odds: you must call ${callAmount.toLocaleString()} to win a pot of ${pot.toLocaleString()}. ` +
        `${callAmount.toLocaleString()} ÷ (${pot.toLocaleString()} + ${callAmount.toLocaleString()}) = ${pct(needed)}. ` +
        `If you win more often than ${pct(needed)}, calling makes money over time.`,
    );
  }
  explanation.push(
    'These chances assume opponents hold random cards. Real players who bet or raise big usually have stronger hands than random, so be more careful against big bets.',
  );

  const improve =
    board.length < 5
      ? equity.categories
          .map((chance, category) => ({ name: CATEGORY_NAMES[category as HandCategory], chance, category: category as HandCategory }))
          .filter((x) => x.chance >= 0.005 && x.category >= HandCategory.OnePair)
          .sort((a, b) => b.category - a.category)
      : [];

  return {
    tier,
    tierAdvice,
    equity,
    needed,
    callVerdict,
    headline,
    explanation,
    improve,
    madeCategory,
  };
}
