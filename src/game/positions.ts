/**
 * Table position names, starting from the button and going clockwise.
 * 6-max: BTN, SB, BB, UTG, HJ, CO.  Heads-up: BTN (also the small blind), BB.
 */
export function positionNames(n: number): string[] {
  if (n === 2) return ['BTN', 'BB'];
  const early: Record<number, string[]> = {
    0: [],
    1: ['UTG'],
    2: ['UTG', 'CO'],
    3: ['UTG', 'HJ', 'CO'],
    4: ['UTG', 'MP', 'HJ', 'CO'],
    5: ['UTG', 'UTG+1', 'MP', 'HJ', 'CO'],
    6: ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
  };
  return ['BTN', 'SB', 'BB', ...(early[n - 3] ?? [])];
}

/** Map of player index -> position name for a hand with `n` players. */
export function positionsFor(n: number, buttonIndex: number): string[] {
  const names = positionNames(n);
  const out = new Array<string>(n);
  for (let i = 0; i < n; i++) out[(buttonIndex + i) % n] = names[i]!;
  return out;
}
