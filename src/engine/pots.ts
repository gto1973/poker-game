/**
 * Main pot / side pot construction and payout.
 *
 * Every chip a player put in this hand (antes, blinds, bets) is a
 * "contribution". Pots are built in layers: each distinct all-in amount
 * creates a boundary, and only players who covered that layer and have
 * not folded can win it.
 */
export interface Contribution {
  id: string;
  amount: number;
  folded: boolean;
}

export interface Pot {
  amount: number;
  /** Players who can win this pot. */
  eligible: string[];
}

export function buildPots(contribs: readonly Contribution[]): Pot[] {
  const levels = [...new Set(contribs.filter((c) => c.amount > 0).map((c) => c.amount))].sort(
    (a, b) => a - b,
  );
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const c of contribs) amount += Math.max(0, Math.min(c.amount, level) - prev);
    const eligible = contribs.filter((c) => !c.folded && c.amount >= level).map((c) => c.id);
    prev = level;
    if (amount === 0) continue;

    const last = pots[pots.length - 1];
    if (eligible.length === 0) {
      // Only folded players reached this layer (shouldn't normally happen once
      // uncalled bets are returned). Give the chips to the previous pot.
      if (last) last.amount += amount;
      else pots.push({ amount, eligible });
    } else if (last && sameSet(last.eligible, eligible)) {
      last.amount += amount;
    } else {
      pots.push({ amount, eligible });
    }
  }
  return pots;
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export interface PotAward {
  potIndex: number;
  amount: number;
  winners: string[];
  /** Chips paid to each winner from this pot. */
  shares: Record<string, number>;
}

/**
 * Split each pot among the eligible player(s) with the best score.
 * `order` lists player ids starting left of the button: odd chips from a
 * split go to the first winner in that order (standard rule).
 */
export function awardPots(
  pots: readonly Pot[],
  scores: Readonly<Record<string, number>>,
  order: readonly string[],
): PotAward[] {
  return pots.map((pot, potIndex) => {
    let best = -1;
    for (const id of pot.eligible) best = Math.max(best, scores[id] ?? -1);
    const winners = order.filter((id) => pot.eligible.includes(id) && scores[id] === best);
    if (winners.length === 0) winners.push(...pot.eligible); // no scores (e.g. uncontested)
    const base = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - base * winners.length;
    const shares: Record<string, number> = {};
    for (const id of winners) {
      shares[id] = base + (odd > 0 ? 1 : 0);
      odd--;
    }
    return { potIndex, amount: pot.amount, winners, shares };
  });
}
