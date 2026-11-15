/**
 * Bot decision making.
 *
 * Bots receive a BotView: only what a real player at the table could see
 * (their own cards, the board, the pot, the bets). They never see other
 * players' hole cards.
 */
import type { Card } from '../engine/cards';
import type { LegalActions, PlayerAction, Street } from '../engine/holdem';
import { estimateEquity, potOdds } from '../engine/equity';
import type { Rng } from '../engine/rng';
import type { BotProfile } from './profiles';
import { chenScore } from './preflop';

export interface BotView {
  hole: Card[];
  board: Card[];
  street: Street;
  /** All chips in the middle, including current-street bets. */
  pot: number;
  legal: LegalActions;
  currentBet: number;
  myBet: number;
  stack: number;
  bigBlind: number;
  /** Opponents who haven't folded. */
  opponents: number;
  /** Number of bets/raises so far this street (preflop counts the big blind as 1). */
  raisesThisStreet: number;
  /** 0 = acts first (worst position), 1 = acts last (button). */
  position: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function raiseTo(view: BotView, target: number): PlayerAction {
  const { legal } = view;
  let to = Math.round(clamp(target, legal.minRaiseTo, legal.maxRaiseTo));
  // If it's most of our stack, just shove.
  if (to >= legal.maxRaiseTo * 0.8) to = legal.maxRaiseTo;
  return { type: legal.raiseKind!, amount: to };
}

function passive(view: BotView): PlayerAction {
  return view.legal.canCheck ? { type: 'check' } : { type: 'fold' };
}

function call(view: BotView): PlayerAction {
  return view.legal.canCheck ? { type: 'check' } : { type: 'call' };
}

export function decide(view: BotView, profile: BotProfile, rng: Rng): PlayerAction {
  return view.street === 'preflop' ? decidePreflop(view, profile, rng) : decidePostflop(view, profile, rng);
}

function decidePreflop(view: BotView, p: BotProfile, rng: Rng): PlayerAction {
  const { legal, bigBlind } = view;
  // Bad players misjudge hands a bit.
  const noise = (rng.next() - 0.5) * 4 * (1 - p.skill);
  // Good players open wider in late position.
  const score = chenScore(view.hole) + noise + view.position * 2 * p.skill;

  // Hand needed to play: tight ≈ 10 (AJo, 99+), loose ≈ 3.
  const playThreshold = 10 - p.looseness * 7;
  const raisesFaced = Math.max(0, view.raisesThisStreet - 1); // big blind doesn't count
  const callCost = legal.callAmount / bigBlind;

  // Facing raises we need a stronger hand; sticky players discount this.
  const needed = playThreshold + raisesFaced * (2.5 - p.stickiness * 1.5) + Math.min(4, callCost / 10);
  const raiseThreshold = needed + 3 - p.aggression * 3;

  const canRaise = legal.raiseKind !== null;
  const bluffRaise = canRaise && raisesFaced === 0 && rng.next() < p.bluff * 0.3;

  if (canRaise && (score >= raiseThreshold || bluffRaise) && rng.next() < 0.4 + p.aggression * 0.6) {
    // Open to ~3bb (+1bb per limper-ish), re-raise to ~3x.
    const target = raisesFaced === 0 ? bigBlind * (2.5 + rng.next()) : view.currentBet * (2.8 + rng.next() * 0.6);
    // Monsters sometimes just shove when deep in a raising war.
    if (raisesFaced >= 2 && score >= 16) return raiseTo(view, legal.maxRaiseTo);
    return raiseTo(view, target);
  }
  if (legal.canCheck) return { type: 'check' };
  if (score >= needed) return { type: 'call' };
  // Very cheap completes (small blind) for loose players.
  if (callCost <= 0.5 && rng.next() < p.looseness) return { type: 'call' };
  return { type: 'fold' };
}

function decidePostflop(view: BotView, p: BotProfile, rng: Rng): PlayerAction {
  const { legal } = view;
  const iterations = Math.round(150 + p.skill * 450);
  let eq = estimateEquity({ hole: view.hole, board: view.board, opponents: Math.max(1, view.opponents), iterations, rng }).equity;

  // Weaker bots misread their hand strength.
  eq += (rng.next() - 0.5) * 0.3 * (1 - p.skill);
  // Skilled bots know a big bet usually means a strong hand (random-hand equity overestimates us).
  const betPressure = legal.callAmount / Math.max(1, view.pot);
  eq -= p.skill * 0.12 * Math.min(1.5, betPressure);
  eq = clamp(eq, 0, 1);

  const canRaise = legal.raiseKind !== null;
  const pot = view.pot;
  const sized = (frac: number) => (legal.raiseKind === 'bet' ? frac * pot : view.currentBet + frac * (pot + legal.callAmount));

  // Value threshold: aggressive players bet thinner.
  const valueBar = 0.72 - p.aggression * 0.17;

  if (legal.canCheck) {
    if (canRaise && eq >= valueBar && rng.next() < 0.5 + p.aggression * 0.5) {
      return raiseTo(view, sized(0.5 + rng.next() * 0.3));
    }
    // Bluff / semi-bluff, more likely with fewer opponents.
    if (canRaise && rng.next() < (p.bluff * 0.6) / view.opponents) {
      return raiseTo(view, sized(0.4 + rng.next() * 0.3));
    }
    return { type: 'check' };
  }

  // Facing a bet.
  const odds = potOdds(legal.callAmount, pot);
  if (canRaise && eq >= valueBar + 0.1 && rng.next() < p.aggression) {
    return raiseTo(view, sized(0.7 + rng.next() * 0.4));
  }
  if (canRaise && rng.next() < p.bluff * 0.08) {
    return raiseTo(view, sized(0.8));
  }
  // Calling stations call with much worse than the right price.
  const callBar = odds - p.stickiness * 0.15 + (1 - p.skill) * 0.03;
  if (eq >= callBar) return call(view);
  return passive(view);
}
