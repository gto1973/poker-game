import { describe, it, expect } from 'vitest';
import { buildPots, awardPots } from '../src/engine/pots';

describe('buildPots', () => {
  it('single pot when everyone contributes equally', () => {
    expect(
      buildPots([
        { id: 'a', amount: 100, folded: false },
        { id: 'b', amount: 100, folded: false },
        { id: 'c', amount: 100, folded: true },
      ]),
    ).toEqual([{ amount: 300, eligible: ['a', 'b'] }]);
  });

  it('creates side pots for short all-ins', () => {
    const pots = buildPots([
      { id: 'short', amount: 50, folded: false },
      { id: 'mid', amount: 200, folded: false },
      { id: 'big', amount: 500, folded: false },
      { id: 'big2', amount: 500, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 200, eligible: ['short', 'mid', 'big', 'big2'] },
      { amount: 450, eligible: ['mid', 'big', 'big2'] },
      { amount: 600, eligible: ['big', 'big2'] },
    ]);
  });

  it('folded money stays in the pot but folded players cannot win', () => {
    const pots = buildPots([
      { id: 'a', amount: 30, folded: true },
      { id: 'b', amount: 100, folded: false },
      { id: 'c', amount: 100, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 230, eligible: ['b', 'c'] }]);
  });
});

describe('awardPots', () => {
  it('splits ties with odd chip to first player left of button', () => {
    const [award] = awardPots([{ amount: 101, eligible: ['a', 'b'] }], { a: 5, b: 5 }, ['b', 'a']);
    expect(award!.shares).toEqual({ b: 51, a: 50 });
  });

  it('side pot can go to a different winner than the main pot', () => {
    const awards = awardPots(
      [
        { amount: 150, eligible: ['short', 'x', 'y'] },
        { amount: 200, eligible: ['x', 'y'] },
      ],
      { short: 9, x: 5, y: 7 },
      ['short', 'x', 'y'],
    );
    expect(awards[0]!.winners).toEqual(['short']);
    expect(awards[1]!.winners).toEqual(['y']);
  });
});
