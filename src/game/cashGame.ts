/**
 * A 6-seat cash game: one human and five bots. Handles seating, moving
 * the button, running hands and replacing bots who go broke.
 */
import { HoldemHand, type PlayerAction } from '../engine/holdem';
import { type Rng, createRng, shuffle } from '../engine/rng';
import { decide, type BotView } from '../ai/bot';
import { PROFILES, BOT_NAMES, type BotProfile, type ProfileKey } from '../ai/profiles';
import { positionsFor } from './positions';

export const HUMAN_ID = 'you';

export interface Seat {
  id: string;
  name: string;
  stack: number;
  isHuman: boolean;
  profile?: BotProfile;
}

export interface CashGameConfig {
  smallBlind: number;
  bigBlind: number;
  /** Chips each bot sits down with. */
  botBuyIn: number;
  humanStack: number;
  seats?: number;
  rng?: Rng;
}

export class CashGame {
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly botBuyIn: number;
  readonly seats: Seat[];
  readonly rng: Rng;
  /** Seat index of the dealer button. */
  buttonSeat: number;
  hand: HoldemHand | null = null;
  /** Seat index for each player index in the current hand. */
  handSeatMap: number[] = [];
  handNumber = 0;
  /** Messages about bots leaving and joining, shown between hands. */
  tableNews: string[] = [];
  private botCounter = 0;
  private usedNames = new Set<string>();

  constructor(cfg: CashGameConfig) {
    this.smallBlind = cfg.smallBlind;
    this.bigBlind = cfg.bigBlind;
    this.botBuyIn = cfg.botBuyIn;
    this.rng = cfg.rng ?? createRng();
    const n = cfg.seats ?? 6;
    this.seats = [{ id: HUMAN_ID, name: 'You', stack: cfg.humanStack, isHuman: true }];
    // Mix of styles so every table has something to learn from.
    const shuffled = shuffle(Object.keys(PROFILES) as ProfileKey[], this.rng);
    for (let i = 1; i < n; i++) this.seats.push(this.newBot(shuffled[(i - 1) % shuffled.length]!));
    this.buttonSeat = this.rng.int(n);
  }

  private newBot(key?: ProfileKey): Seat {
    const keys = Object.keys(PROFILES) as ProfileKey[];
    const k = key ?? keys[this.rng.int(keys.length)]!;
    const free = BOT_NAMES.filter((x) => !this.usedNames.has(x));
    const name = free.length ? free[this.rng.int(free.length)]! : `Bot ${this.botCounter + 1}`;
    this.usedNames.add(name);
    return { id: `bot${++this.botCounter}`, name, stack: this.botBuyIn, isHuman: false, profile: PROFILES[k] };
  }

  get human(): Seat {
    return this.seats[0]!;
  }

  seatOf(id: string): Seat | undefined {
    return this.seats.find((s) => s.id === id);
  }

  nameOf = (id: string): string => this.seatOf(id)?.name ?? id;

  canStartHand(): boolean {
    return this.seats.filter((s) => s.stack > 0).length >= 2 && this.human.stack > 0;
  }

  startHand(): HoldemHand {
    if (this.hand && !this.hand.isComplete) throw new Error('Hand in progress');
    if (!this.canStartHand()) throw new Error('Not enough players with chips');
    this.tableNews = [];
    const n = this.seats.length;
    // Move the button to the next seat with chips.
    for (let i = 1; i <= n; i++) {
      const s = (this.buttonSeat + i) % n;
      if (this.seats[s]!.stack > 0) {
        this.buttonSeat = s;
        break;
      }
    }
    this.handSeatMap = [];
    const players = [];
    let buttonIndex = 0;
    for (let s = 0; s < n; s++) {
      const seat = this.seats[s]!;
      if (seat.stack <= 0) continue;
      if (s === this.buttonSeat) buttonIndex = players.length;
      this.handSeatMap.push(s);
      players.push({ id: seat.id, name: seat.name, stack: seat.stack });
    }
    this.handNumber++;
    this.hand = new HoldemHand({
      players,
      buttonIndex,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      rng: this.rng,
    });
    if (this.hand.isComplete) this.settle();
    return this.hand;
  }

  /** Position name for each seat index in the current hand ('' if sitting out). */
  seatPositions(): string[] {
    const out = this.seats.map(() => '');
    if (!this.hand) return out;
    const pos = positionsFor(this.hand.players.length, this.hand.buttonIndex);
    this.handSeatMap.forEach((seat, i) => (out[seat] = pos[i]!));
    return out;
  }

  isHumanTurn(): boolean {
    return !!this.hand && !this.hand.isComplete && this.hand.toActId === HUMAN_ID;
  }

  act(action: PlayerAction): void {
    const hand = this.hand;
    if (!hand || hand.isComplete) throw new Error('No hand in progress');
    hand.act(action);
    if (hand.isComplete) this.settle();
  }

  /** Let the bot whose turn it is act. Returns the action taken. */
  botAct(): PlayerAction {
    const hand = this.hand!;
    const p = hand.toAct!;
    const seat = this.seatOf(p.id)!;
    if (seat.isHuman) throw new Error("It's the human's turn");
    const action = decide(this.botView(), seat.profile!, this.rng);
    this.act(action);
    return action;
  }

  botView(): BotView {
    const hand = this.hand!;
    const p = hand.toAct!;
    const live = hand.players.filter((x) => !x.folded);
    const n = hand.players.length;
    // Position: 0 = first to act postflop (left of button) .. 1 = button.
    const distFromButton = (p.index - hand.buttonIndex + n) % n; // 0 = button
    const position = distFromButton === 0 ? 1 : (distFromButton - 1) / Math.max(1, n - 1);
    const raises = hand.events.filter(
      (e) => e.type === 'action' && e.street === hand.street && (e.action === 'bet' || e.action === 'raise'),
    ).length;
    return {
      hole: [...p.hole],
      board: [...hand.board],
      street: hand.street,
      pot: hand.potTotal,
      legal: hand.legalActions(),
      currentBet: hand.currentBet,
      myBet: p.bet,
      stack: p.stack,
      bigBlind: hand.bigBlind,
      opponents: live.length - 1,
      raisesThisStreet: raises + (hand.street === 'preflop' ? 1 : 0),
      position,
    };
  }

  /** Copy final stacks back to seats and replace broke bots. */
  private settle(): void {
    const result = this.hand!.result!;
    for (const seat of this.seats) {
      const st = result.finalStacks[seat.id];
      if (st !== undefined) seat.stack = st;
    }
    for (let i = 0; i < this.seats.length; i++) {
      const seat = this.seats[i]!;
      if (!seat.isHuman && seat.stack <= 0) {
        this.usedNames.delete(seat.name);
        const bot = this.newBot();
        this.seats[i] = bot;
        this.tableNews.push(`${seat.name} is out of chips. ${bot.name} sits down.`);
      }
    }
  }
}
