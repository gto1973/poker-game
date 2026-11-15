import { describe, it, expect } from 'vitest';
import { HoldemHand, type SeatInput, type PlayerAction } from '../src/engine/holdem';
import { parseCards, fullDeck, type Card } from '../src/engine/cards';
import { createRng } from '../src/engine/rng';

/**
 * Build a deck that deals the given hole cards (in seat order) and board.
 * Dealing starts left of the button, one card each, twice; then burn/flop/burn/turn/burn/river.
 */
function stackedDeck(holes: string[], board: string, buttonIndex: number): Card[] {
  const n = holes.length;
  const holeCards = holes.map(parseCards);
  const boardCards = parseCards(board);
  const used = new Set<Card>([...holeCards.flat(), ...boardCards]);
  const filler = fullDeck().filter((c) => !used.has(c));
  const deck: Card[] = [];
  for (let r = 0; r < 2; r++) for (let i = 1; i <= n; i++) deck.push(holeCards[(buttonIndex + i) % n]![r]!);
  const burn = () => deck.push(filler.shift()!);
  burn(); deck.push(...boardCards.slice(0, 3));
  burn(); deck.push(boardCards[3]!);
  burn(); deck.push(boardCards[4]!);
  return [...deck, ...filler];
}

const seats = (...stacks: number[]): SeatInput[] => stacks.map((stack, i) => ({ id: `p${i}`, stack }));

function play(hand: HoldemHand, ...actions: [id: string, a: PlayerAction][]) {
  for (const [id, a] of actions) {
    expect(hand.toActId).toBe(id);
    hand.act(a);
  }
}

const total = (h: HoldemHand) => h.players.reduce((s, p) => s + p.stack + p.contributed, 0);

describe('HoldemHand: blinds and order', () => {
  it('3-handed: SB/BB left of button, UTG (button) acts first preflop', () => {
    const h = new HoldemHand({ players: seats(1000, 1000, 1000), buttonIndex: 0, smallBlind: 5, bigBlind: 10 });
    expect(h.players[1]!.bet).toBe(5);
    expect(h.players[2]!.bet).toBe(10);
    expect(h.toActId).toBe('p0');
    expect(h.legalActions()).toMatchObject({ callAmount: 10, canCheck: false, raiseKind: 'raise', minRaiseTo: 20, maxRaiseTo: 1000 });
  });

  it('heads-up: button is small blind, acts first preflop and last postflop', () => {
    const h = new HoldemHand({ players: seats(1000, 1000), buttonIndex: 0, smallBlind: 5, bigBlind: 10 });
    expect(h.players[0]!.bet).toBe(5);
    expect(h.players[1]!.bet).toBe(10);
    play(h, ['p0', { type: 'call' }], ['p1', { type: 'check' }]);
    expect(h.street).toBe('flop');
    expect(h.toActId).toBe('p1');
  });

  it('big blind gets the option when everyone limps', () => {
    const h = new HoldemHand({ players: seats(1000, 1000, 1000), buttonIndex: 0, smallBlind: 5, bigBlind: 10 });
    play(h, ['p0', { type: 'call' }], ['p1', { type: 'call' }]);
    expect(h.street).toBe('preflop');
    expect(h.toActId).toBe('p2');
    expect(h.legalActions().canCheck).toBe(true);
    h.act({ type: 'raise', amount: 40 });
    expect(h.toActId).toBe('p0'); // action re-opened
  });
});

describe('HoldemHand: raises', () => {
  it('min-raise is the size of the last raise', () => {
    const h = new HoldemHand({ players: seats(1000, 1000, 1000), buttonIndex: 0, smallBlind: 5, bigBlind: 10 });
    h.act({ type: 'raise', amount: 35 }); // raise of 25
    expect(h.legalActions().minRaiseTo).toBe(60);
    expect(() => h.act({ type: 'raise', amount: 50 })).toThrow(/below minimum/);
  });

  it('incomplete all-in raise does not re-open betting for players who acted', () => {
    // p0 button, p1 SB, p2 BB. p1 has 45 total, so all-in to 45 is an incomplete raise over 30.
    const h = new HoldemHand({ players: seats(1000, 45, 1000), buttonIndex: 0, smallBlind: 5, bigBlind: 10 });
    h.act({ type: 'raise', amount: 30 }); // p0 raises by 20
    h.act({ type: 'raise', amount: 45 }); // p1 all-in, raise of 15 < 20
    expect(h.toActId).toBe('p2');
    expect(h.legalActions().raiseKind).toBe('raise'); // p2 hasn't acted yet, may raise
    h.act({ type: 'call' });
    expect(h.toActId).toBe('p0');
    const legal = h.legalActions();
    expect(legal.raiseKind).toBeNull(); // p0 already acted, can only call/fold
    expect(legal.callAmount).toBe(15);
  });

  it('uncalled bet is returned', () => {
    const h = new HoldemHand({ players: seats(1000, 1000), buttonIndex: 0, smallBlind: 5, bigBlind: 10 });
    play(h, ['p0', { type: 'raise', amount: 300 }], ['p1', { type: 'fold' }]);
    expect(h.isComplete).toBe(true);
    expect(h.result!.finalStacks).toEqual({ p0: 1010, p1: 990 });
    expect(h.events.some((e) => e.type === 'refund' && e.id === 'p0' && e.amount === 290)).toBe(true);
  });
});

describe('HoldemHand: showdown and side pots', () => {
  it('best hand wins at showdown', () => {
    const deck = stackedDeck(['As Ad', 'Kc Kd'], '2h 7c 9s Jd 3c', 0);
    const h = new HoldemHand({ players: seats(500, 500), buttonIndex: 0, smallBlind: 5, bigBlind: 10, deck });
    play(h, ['p0', { type: 'call' }], ['p1', { type: 'check' }]);
    for (let s = 0; s < 3; s++) play(h, ['p1', { type: 'check' }], ['p0', { type: 'check' }]);
    expect(h.result!.showdown).toBe(true);
    expect(h.result!.finalStacks).toEqual({ p0: 510, p1: 490 });
  });

  it('all-in preflop runs out the board automatically', () => {
    const deck = stackedDeck(['As Ad', 'Kc Kd'], '2h 7c 9s Jd 3c', 0);
    const h = new HoldemHand({ players: seats(500, 300), buttonIndex: 0, smallBlind: 5, bigBlind: 10, deck });
    play(h, ['p0', { type: 'raise', amount: 500 }], ['p1', { type: 'call' }]);
    expect(h.isComplete).toBe(true);
    expect(h.board).toHaveLength(5);
    expect(h.result!.finalStacks).toEqual({ p0: 800, p1: 0 });
  });

  it('short stack wins main pot, bigger stack wins side pot', () => {
    // p0 button (AA, short), p1 SB (KK), p2 BB (QQ)
    const deck = stackedDeck(['As Ad', 'Kc Kd', 'Qh Qs'], '2h 7c 9s Jd 3c', 0);
    const h = new HoldemHand({ players: seats(100, 1000, 1000), buttonIndex: 0, smallBlind: 5, bigBlind: 10, deck });
    play(h,
      ['p0', { type: 'raise', amount: 100 }],
      ['p1', { type: 'raise', amount: 400 }],
      ['p2', { type: 'call' }],
    );
    // Flop: p1 and p2 check it down.
    for (let s = 0; s < 3; s++) play(h, ['p1', { type: 'check' }], ['p2', { type: 'check' }]);
    expect(h.result!.pots.map((p) => p.amount)).toEqual([300, 600]);
    expect(h.result!.finalStacks).toEqual({ p0: 300, p1: 1200, p2: 600 });
  });

  it('split pot when the board plays', () => {
    const deck = stackedDeck(['2c 3d', '4h 5s'], 'Ac Kd Qh Js Tc', 0);
    const h = new HoldemHand({ players: seats(500, 500), buttonIndex: 0, smallBlind: 5, bigBlind: 10, deck });
    play(h, ['p0', { type: 'call' }], ['p1', { type: 'check' }]);
    for (let s = 0; s < 3; s++) play(h, ['p1', { type: 'check' }], ['p0', { type: 'check' }]);
    expect(h.result!.finalStacks).toEqual({ p0: 500, p1: 500 });
  });
});

describe('HoldemHand: short stacks and antes', () => {
  it('big blind all-in for less than a full blind', () => {
    const h = new HoldemHand({ players: seats(1000, 1000, 4), buttonIndex: 0, smallBlind: 5, bigBlind: 10 });
    expect(h.players[2]!.allIn).toBe(true);
    expect(h.legalActions().callAmount).toBe(10); // others still call the full big blind
  });

  it('antes go into the pot', () => {
    const h = new HoldemHand({ players: seats(1000, 1000, 1000), buttonIndex: 0, smallBlind: 5, bigBlind: 10, ante: 2 });
    expect(h.potTotal).toBe(21);
    play(h, ['p0', { type: 'fold' }], ['p1', { type: 'fold' }]);
    expect(h.result!.finalStacks).toEqual({ p0: 998, p1: 993, p2: 1009 });
  });
});

describe('HoldemHand: fuzz', () => {
  it('random legal play never loses or creates chips (5k hands)', () => {
    const rng = createRng(2024);
    for (let n = 0; n < 5000; n++) {
      const count = 2 + rng.int(8);
      const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, stack: 1 + rng.int(2000) }));
      const startTotal = players.reduce((s, p) => s + p.stack, 0);
      const h = new HoldemHand({
        players,
        buttonIndex: rng.int(count),
        smallBlind: 5,
        bigBlind: 10,
        ante: rng.int(3) === 0 ? 1 + rng.int(5) : 0,
        rng,
      });
      let guard = 0;
      while (!h.isComplete) {
        expect(total(h)).toBe(startTotal);
        const l = h.legalActions();
        const r = rng.next();
        if (l.raiseKind && r < 0.25) {
          const to = l.minRaiseTo + rng.int(l.maxRaiseTo - l.minRaiseTo + 1);
          h.act({ type: l.raiseKind, amount: to });
        } else if (r < 0.4 && !l.canCheck) h.act({ type: 'fold' });
        else if (l.canCheck) h.act({ type: 'check' });
        else h.act({ type: 'call' });
        if (++guard > 500) throw new Error('hand did not terminate');
      }
      const finalTotal = Object.values(h.result!.finalStacks).reduce((a, b) => a + b, 0);
      expect(finalTotal).toBe(startTotal);
      expect(Object.values(h.result!.finalStacks).every((s) => s >= 0)).toBe(true);
      expect(Object.values(h.result!.net).reduce((a, b) => a + b, 0)).toBe(0);
    }
  });
});
