/**
 * No-Limit Texas Hold'em: the state machine for a single hand.
 *
 * Usage:
 *   const hand = new HoldemHand({ players, buttonIndex, smallBlind, bigBlind });
 *   while (!hand.isComplete) {
 *     const legal = hand.legalActions();      // for hand.toActId
 *     hand.act({ type: 'call' });
 *   }
 *   hand.result  // winners, payouts, final stacks
 *
 * The class knows nothing about UI or bots. It records an event log that the
 * UI animates from and the hand-review screen replays.
 */
import { type Card, fullDeck } from './cards';
import { type Rng, createRng, shuffle } from './rng';
import { evaluate, describeScore } from './evaluator';
import { buildPots, awardPots, type Pot, type PotAward } from './pots';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface PlayerAction {
  type: ActionType;
  /** For bet/raise: the total amount this player's bet becomes this street ("raise to"). */
  amount?: number;
}

export interface SeatInput {
  id: string;
  name?: string;
  stack: number;
}

export interface HandConfig {
  /** Players in clockwise seat order. Everyone must have chips. */
  players: SeatInput[];
  /** Index into `players` of the dealer button. */
  buttonIndex: number;
  smallBlind: number;
  bigBlind: number;
  /** Per-player ante (tournaments). Default 0. */
  ante?: number;
  rng?: Rng;
  /** Fixed deck order (top card first) – for tests and replays. */
  deck?: Card[];
}

export interface PlayerState {
  id: string;
  name: string;
  /** Index in seat order. */
  index: number;
  startStack: number;
  stack: number;
  hole: Card[];
  /** Chips put in on the current street. */
  bet: number;
  /** Chips put in over the whole hand. */
  contributed: number;
  folded: boolean;
  allIn: boolean;
  /** Has acted since the last full raise on this street. */
  acted: boolean;
  /** May still raise this street (false after facing an incomplete all-in raise). */
  mayRaise: boolean;
}

export type HandEvent =
  | { type: 'ante'; id: string; amount: number }
  | { type: 'blind'; id: string; kind: 'small' | 'big'; amount: number }
  | { type: 'deal' }
  | { type: 'action'; id: string; street: Street; action: ActionType; /** total bet after action */ to: number; allIn: boolean }
  | { type: 'street'; street: Street; board: Card[] }
  | { type: 'refund'; id: string; amount: number }
  | { type: 'show'; id: string; hole: Card[]; score: number; description: string }
  | { type: 'win'; id: string; amount: number; potIndex: number; description?: string };

export interface LegalActions {
  playerId: string;
  canFold: boolean;
  canCheck: boolean;
  /** Chips needed to call (already capped at the player's stack). 0 = can't call. */
  callAmount: number;
  /** 'bet' when no one has bet this street, otherwise 'raise'. null if not allowed. */
  raiseKind: 'bet' | 'raise' | null;
  /** Smallest legal "raise to" (may equal maxRaiseTo when only an all-in is possible). */
  minRaiseTo: number;
  /** Largest legal "raise to" = all-in. */
  maxRaiseTo: number;
}

export interface HandResult {
  /** Showdown happened (vs. everyone else folding). */
  showdown: boolean;
  pots: Pot[];
  awards: PotAward[];
  /** Total won per player id (gross, including own contribution back). */
  winnings: Record<string, number>;
  /** Net chip change per player id. */
  net: Record<string, number>;
  finalStacks: Record<string, number>;
}

export class HoldemHand {
  readonly players: PlayerState[];
  readonly buttonIndex: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly ante: number;
  readonly events: HandEvent[] = [];
  readonly board: Card[] = [];

  street: Street = 'preflop';
  /** Highest bet on the current street. */
  currentBet = 0;
  /** Size of the last full raise (the minimum raise increment). */
  lastRaiseSize = 0;
  /** Index of the player to act, or -1 when no action is pending. */
  toActIndex = -1;
  result: HandResult | null = null;

  readonly sbIndex: number;
  readonly bbIndex: number;
  private deck: Card[];

  constructor(cfg: HandConfig) {
    if (cfg.players.length < 2) throw new Error('Need at least 2 players');
    if (cfg.players.some((p) => p.stack <= 0)) throw new Error('All players need chips');
    if (cfg.bigBlind <= 0 || cfg.smallBlind < 0) throw new Error('Invalid blinds');

    this.buttonIndex = cfg.buttonIndex;
    this.smallBlind = cfg.smallBlind;
    this.bigBlind = cfg.bigBlind;
    this.ante = cfg.ante ?? 0;
    this.players = cfg.players.map((p, index) => ({
      id: p.id,
      name: p.name ?? p.id,
      index,
      startStack: p.stack,
      stack: p.stack,
      hole: [],
      bet: 0,
      contributed: 0,
      folded: false,
      allIn: false,
      acted: false,
      mayRaise: true,
    }));
    this.deck = cfg.deck ? [...cfg.deck] : shuffle(fullDeck(), cfg.rng ?? createRng());

    const n = this.players.length;
    // Heads-up: the button posts the small blind and acts first preflop.
    this.sbIndex = n === 2 ? this.buttonIndex : (this.buttonIndex + 1) % n;
    this.bbIndex = (this.sbIndex + 1) % n;

    this.postForcedBets();
    this.dealHoleCards();
    this.currentBet = this.bigBlind;
    this.lastRaiseSize = this.bigBlind;
    this.toActIndex = this.nextToAct(this.bbIndex);
    this.advanceIfRoundDone();
  }

  // ---------------------------------------------------------------- queries

  get isComplete(): boolean {
    return this.result !== null;
  }

  get toAct(): PlayerState | null {
    return this.toActIndex >= 0 ? this.players[this.toActIndex]! : null;
  }

  get toActId(): string | null {
    return this.toAct?.id ?? null;
  }

  player(id: string): PlayerState {
    const p = this.players.find((x) => x.id === id);
    if (!p) throw new Error(`Unknown player ${id}`);
    return p;
  }

  /** Total chips in the middle (all contributions this hand). */
  get potTotal(): number {
    return this.players.reduce((s, p) => s + p.contributed, 0);
  }

  legalActions(): LegalActions {
    const p = this.toAct;
    if (!p) throw new Error('No player to act');
    const toCall = Math.min(this.currentBet - p.bet, p.stack);
    const maxRaiseTo = p.bet + p.stack;
    const othersCanRespond = this.players.some(
      (o) => o !== p && !o.folded && !o.allIn,
    );
    const canRaise = p.mayRaise && p.stack > toCall && othersCanRespond;
    const minRaiseTo = Math.min(
      this.currentBet === 0 ? this.bigBlind : this.currentBet + this.lastRaiseSize,
      maxRaiseTo,
    );
    return {
      playerId: p.id,
      canFold: true,
      canCheck: toCall === 0,
      callAmount: toCall,
      raiseKind: canRaise ? (this.currentBet === 0 ? 'bet' : 'raise') : null,
      minRaiseTo: canRaise ? minRaiseTo : 0,
      maxRaiseTo: canRaise ? maxRaiseTo : 0,
    };
  }

  // ---------------------------------------------------------------- actions

  act(action: PlayerAction): void {
    const p = this.toAct;
    if (!p || this.isComplete) throw new Error('No action pending');
    const legal = this.legalActions();

    switch (action.type) {
      case 'fold':
        p.folded = true;
        this.log({ type: 'action', id: p.id, street: this.street, action: 'fold', to: p.bet, allIn: false });
        break;

      case 'check':
        if (!legal.canCheck) throw new Error(`${p.id} cannot check, must call ${legal.callAmount}`);
        this.log({ type: 'action', id: p.id, street: this.street, action: 'check', to: p.bet, allIn: false });
        break;

      case 'call':
        if (legal.callAmount === 0) throw new Error(`${p.id} has nothing to call`);
        this.commit(p, legal.callAmount);
        this.log({ type: 'action', id: p.id, street: this.street, action: 'call', to: p.bet, allIn: p.allIn });
        break;

      case 'bet':
      case 'raise': {
        if (!legal.raiseKind) throw new Error(`${p.id} cannot raise`);
        const to = action.amount;
        if (to === undefined || !Number.isInteger(to)) throw new Error('Raise needs an integer amount');
        if (to > legal.maxRaiseTo) throw new Error(`Raise to ${to} exceeds stack (max ${legal.maxRaiseTo})`);
        if (to < legal.minRaiseTo) throw new Error(`Raise to ${to} below minimum ${legal.minRaiseTo}`);
        const raiseSize = to - this.currentBet;
        this.commit(p, to - p.bet);
        if (raiseSize >= this.lastRaiseSize) {
          // Full raise: re-opens the betting for everyone.
          this.lastRaiseSize = raiseSize;
          for (const o of this.players) {
            if (o !== p && !o.folded && !o.allIn) {
              o.acted = false;
              o.mayRaise = true;
            }
          }
        } else {
          // Incomplete all-in raise: players who already acted may only call or fold.
          for (const o of this.players) {
            if (o !== p && !o.folded && !o.allIn && o.acted) {
              o.acted = false;
              o.mayRaise = false;
            }
          }
        }
        this.currentBet = to;
        this.log({ type: 'action', id: p.id, street: this.street, action: legal.raiseKind, to, allIn: p.allIn });
        break;
      }

      default:
        throw new Error(`Unknown action ${(action as PlayerAction).type}`);
    }

    p.acted = true;
    this.toActIndex = this.nextToAct(p.index);
    this.advanceIfRoundDone();
  }

  // --------------------------------------------------------------- internals

  private log(e: HandEvent): void {
    this.events.push(e);
  }

  private commit(p: PlayerState, amount: number): void {
    const a = Math.min(amount, p.stack);
    p.stack -= a;
    p.bet += a;
    p.contributed += a;
    if (p.stack === 0) p.allIn = true;
  }

  private postForcedBets(): void {
    if (this.ante > 0) {
      for (const p of this.players) {
        const a = Math.min(this.ante, p.stack);
        p.stack -= a;
        p.contributed += a;
        if (p.stack === 0) p.allIn = true;
        this.log({ type: 'ante', id: p.id, amount: a });
      }
    }
    const sb = this.players[this.sbIndex]!;
    const bb = this.players[this.bbIndex]!;
    const sbAmt = Math.min(this.smallBlind, sb.stack);
    this.commit(sb, sbAmt);
    this.log({ type: 'blind', id: sb.id, kind: 'small', amount: sbAmt });
    const bbAmt = Math.min(this.bigBlind, bb.stack);
    this.commit(bb, bbAmt);
    this.log({ type: 'blind', id: bb.id, kind: 'big', amount: bbAmt });
  }

  private draw(): Card {
    const c = this.deck.shift();
    if (c === undefined) throw new Error('Deck is empty');
    return c;
  }

  private dealHoleCards(): void {
    const n = this.players.length;
    for (let round = 0; round < 2; round++) {
      for (let i = 1; i <= n; i++) this.players[(this.buttonIndex + i) % n]!.hole.push(this.draw());
    }
    this.log({ type: 'deal' });
  }

  private live(): PlayerState[] {
    return this.players.filter((p) => !p.folded);
  }

  private needsToAct(p: PlayerState): boolean {
    return !p.folded && !p.allIn && (!p.acted || p.bet < this.currentBet);
  }

  /** Next seat after `fromIndex` that still needs to act, or -1. */
  private nextToAct(fromIndex: number): number {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (fromIndex + i) % n;
      if (this.needsToAct(this.players[idx]!)) return idx;
    }
    return -1;
  }

  private bettingRoundDone(): boolean {
    const live = this.live();
    if (live.length <= 1) return true;
    const canAct = live.filter((p) => !p.allIn);
    if (canAct.length === 0) return true;
    // A lone player with chips who already matches the biggest bet has no one to play against.
    if (canAct.length === 1) {
      const maxBet = Math.max(...live.map((p) => p.bet));
      if (canAct[0]!.bet >= maxBet) return true;
    }
    return canAct.every((p) => p.acted && p.bet === this.currentBet);
  }

  private advanceIfRoundDone(): void {
    while (!this.isComplete && this.bettingRoundDone()) {
      this.returnUncalledBet();
      for (const p of this.players) {
        p.bet = 0;
        p.acted = false;
        p.mayRaise = true;
      }
      this.currentBet = 0;
      this.lastRaiseSize = this.bigBlind;
      this.toActIndex = -1;

      const live = this.live();
      if (live.length === 1) {
        this.finishUncontested(live[0]!);
        return;
      }
      if (this.street === 'river') {
        this.showdown();
        return;
      }
      this.dealNextStreet();
      // If fewer than two players can still bet, the loop runs the board out.
      this.toActIndex = this.nextToAct(this.buttonIndex);
    }
  }

  /** The part of the biggest bet nobody matched goes back to its owner. */
  private returnUncalledBet(): void {
    const sorted = [...this.players].sort((a, b) => b.bet - a.bet);
    const top = sorted[0]!;
    const second = sorted[1]?.bet ?? 0;
    const excess = top.bet - second;
    if (excess > 0) {
      top.bet -= excess;
      top.contributed -= excess;
      top.stack += excess;
      if (top.stack > 0) top.allIn = false;
      this.log({ type: 'refund', id: top.id, amount: excess });
    }
  }

  private dealNextStreet(): void {
    this.draw(); // burn
    if (this.street === 'preflop') {
      this.board.push(this.draw(), this.draw(), this.draw());
      this.street = 'flop';
    } else if (this.street === 'flop') {
      this.board.push(this.draw());
      this.street = 'turn';
    } else {
      this.board.push(this.draw());
      this.street = 'river';
    }
    this.log({ type: 'street', street: this.street, board: [...this.board] });
  }

  /** Player ids clockwise starting left of the button (odd-chip order). */
  private orderFromButton(): string[] {
    const n = this.players.length;
    return Array.from({ length: n }, (_, i) => this.players[(this.buttonIndex + 1 + i) % n]!.id);
  }

  private finishUncontested(winner: PlayerState): void {
    const pots = buildPots(this.players.map((p) => ({ id: p.id, amount: p.contributed, folded: p.folded })));
    const total = this.potTotal;
    winner.stack += total;
    this.log({ type: 'win', id: winner.id, amount: total, potIndex: 0 });
    this.street = 'showdown';
    this.finalize(false, pots, [
      { potIndex: 0, amount: total, winners: [winner.id], shares: { [winner.id]: total } },
    ]);
  }

  private showdown(): void {
    this.street = 'showdown';
    const scores: Record<string, number> = {};
    for (const p of this.live()) {
      const score = evaluate([...p.hole, ...this.board]);
      scores[p.id] = score;
      this.log({ type: 'show', id: p.id, hole: [...p.hole], score, description: describeScore(score) });
    }
    const pots = buildPots(this.players.map((p) => ({ id: p.id, amount: p.contributed, folded: p.folded })));
    const awards = awardPots(pots, scores, this.orderFromButton());
    for (const a of awards) {
      for (const [id, amt] of Object.entries(a.shares)) {
        this.player(id).stack += amt;
        this.log({ type: 'win', id, amount: amt, potIndex: a.potIndex, description: describeScore(scores[id]!) });
      }
    }
    this.finalize(true, pots, awards);
  }

  private finalize(showdown: boolean, pots: Pot[], awards: PotAward[]): void {
    const winnings: Record<string, number> = {};
    const net: Record<string, number> = {};
    const finalStacks: Record<string, number> = {};
    for (const p of this.players) {
      winnings[p.id] = 0;
      finalStacks[p.id] = p.stack;
      net[p.id] = p.stack - p.startStack;
    }
    for (const a of awards) for (const [id, amt] of Object.entries(a.shares)) winnings[id]! += amt;
    this.toActIndex = -1;
    this.result = { showdown, pots, awards, winnings, net, finalStacks };
  }
}
