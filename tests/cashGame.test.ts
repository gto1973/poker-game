import { describe, it, expect } from 'vitest';
import { CashGame, HUMAN_ID } from '../src/game/cashGame';
import { decide } from '../src/ai/bot';
import { PROFILES, type BotProfile } from '../src/ai/profiles';
import { chenScore, handClass } from '../src/ai/preflop';
import { parseCards } from '../src/engine/cards';
import { createRng } from '../src/engine/rng';
import { positionNames } from '../src/game/positions';

describe('preflop helpers', () => {
  it('chen scores', () => {
    expect(chenScore(parseCards('As Ad'))).toBe(20);
    expect(chenScore(parseCards('Ks Qs'))).toBe(10);
    expect(chenScore(parseCards('7c 2d'))).toBe(-1);
    expect(chenScore(parseCards('2c 2d'))).toBe(5);
  });
  it('hand class', () => {
    expect(handClass(parseCards('Ks As'))).toBe('AKs');
    expect(handClass(parseCards('9d Tc'))).toBe('T9o');
  });
  it('positions', () => {
    expect(positionNames(6)).toEqual(['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO']);
    expect(positionNames(2)).toEqual(['BTN', 'BB']);
  });
});

/** Play the human seat with a solid bot so we can simulate whole sessions. */
function autoplay(game: CashGame, hands: number, humanProfile: BotProfile = PROFILES.grinder) {
  const vpip: Record<string, { hands: number; played: number }> = {};
  for (let h = 0; h < hands && game.canStartHand(); h++) {
    const hand = game.startHand();
    const voluntarily = new Set<string>();
    while (!hand.isComplete) {
      const id = hand.toActId!;
      const style = id === HUMAN_ID ? 'human' : game.seatOf(id)!.profile!.style;
      const action = id === HUMAN_ID ? decide(game.botView(), humanProfile, game.rng) : game.botAct();
      if (id === HUMAN_ID) game.act(action);
      if (hand.street === 'preflop' || hand.board.length === 3) {
        if (['call', 'bet', 'raise'].includes(action.type)) voluntarily.add(style);
      }
    }
    for (const p of hand.players) {
      const style = p.id === HUMAN_ID ? 'human' : (game.seatOf(p.id)?.profile?.style ?? 'gone');
      vpip[style] ??= { hands: 0, played: 0 };
      vpip[style].hands++;
    }
    for (const s of voluntarily) vpip[s] && vpip[s].played++;
  }
  return vpip;
}

describe('CashGame', () => {
  it('runs thousands of bot hands without errors, chips are conserved', () => {
    const game = new CashGame({ smallBlind: 10, bigBlind: 20, botBuyIn: 2000, humanStack: 1_000_000, rng: createRng(7) });
    let injected = 0;
    const startTotal = game.seats.reduce((s, x) => s + x.stack, 0);
    for (let h = 0; h < 2000; h++) {
      game.startHand();
      const before = game.seats.reduce((s, x) => s + x.stack, 0);
      while (!game.hand!.isComplete) {
        if (game.isHumanTurn()) game.act(decide(game.botView(), PROFILES.shark, game.rng));
        else game.botAct();
      }
      const after = game.seats.reduce((s, x) => s + x.stack, 0);
      injected += after - before; // new bots buying in
      expect(game.seats.every((s) => s.stack >= 0)).toBe(true);
    }
    const endTotal = game.seats.reduce((s, x) => s + x.stack, 0);
    expect(endTotal).toBe(startTotal + injected);
    expect(injected % 2000).toBe(0);
  });

  it('button moves one seat each hand', () => {
    const game = new CashGame({ smallBlind: 10, bigBlind: 20, botBuyIn: 2000, humanStack: 2000, rng: createRng(1) });
    game.startHand();
    const b1 = game.buttonSeat;
    while (!game.hand!.isComplete) game.act({ type: game.hand!.legalActions().canCheck ? 'check' : 'fold' });
    game.startHand();
    expect(game.buttonSeat).toBe((b1 + 1) % 6);
  });

  it('loose styles play more hands than tight styles', () => {
    const game = new CashGame({ smallBlind: 10, bigBlind: 20, botBuyIn: 100_000, humanStack: 100_000, rng: createRng(99) });
    const stats = autoplay(game, 1500);
    const rate = (s: string) => stats[s]!.played / stats[s]!.hands;
    expect(rate('Maniac')).toBeGreaterThan(rate('Rock') + 0.2);
    expect(rate('Calling Station')).toBeGreaterThan(rate('Rock'));
  });
});
