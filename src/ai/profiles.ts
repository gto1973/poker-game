/**
 * Bot personalities. Each is a handful of dials the decision code reads.
 * Phase 3 will add tilt, opponent modelling and difficulty presets.
 */
export interface BotProfile {
  /** Short style label shown to the player, e.g. "Rock". */
  style: string;
  /** One-line hint about how to beat it (for learning). */
  tip: string;
  /** 0 = only premium hands, 1 = plays almost anything. */
  looseness: number;
  /** 0 = checks and calls, 1 = bets and raises. */
  aggression: number;
  /** How often it bets or raises with weak hands. 0..1 */
  bluff: number;
  /** How reluctant it is to fold once involved (calling station). 0..1 */
  stickiness: number;
  /** Judgement quality: more simulations, less noise, respects big bets. 0..1 */
  skill: number;
}

export const PROFILES = {
  rock: {
    style: 'Rock',
    tip: 'Only plays strong hands. Steal their blinds; fold when they suddenly raise.',
    looseness: 0.15, aggression: 0.35, bluff: 0.03, stickiness: 0.2, skill: 0.6,
  },
  shark: {
    style: 'Shark',
    tip: 'Solid and aggressive. Avoid marginal spots against them.',
    looseness: 0.35, aggression: 0.75, bluff: 0.15, stickiness: 0.25, skill: 0.95,
  },
  maniac: {
    style: 'Maniac',
    tip: 'Bets and bluffs constantly. Call down lighter with decent hands.',
    looseness: 0.8, aggression: 0.95, bluff: 0.45, stickiness: 0.4, skill: 0.4,
  },
  station: {
    style: 'Calling Station',
    tip: 'Calls far too much. Never bluff; bet your good hands for value.',
    looseness: 0.75, aggression: 0.1, bluff: 0.02, stickiness: 0.9, skill: 0.3,
  },
  fish: {
    style: 'Fish',
    tip: 'Plays too many hands and makes random mistakes.',
    looseness: 0.65, aggression: 0.4, bluff: 0.12, stickiness: 0.6, skill: 0.15,
  },
  grinder: {
    style: 'Grinder',
    tip: 'Tight-aggressive regular. Respect their raises.',
    looseness: 0.3, aggression: 0.6, bluff: 0.1, stickiness: 0.3, skill: 0.8,
  },
} satisfies Record<string, BotProfile>;

export type ProfileKey = keyof typeof PROFILES;

export const BOT_NAMES = [
  'Ava', 'Ben', 'Cleo', 'Dex', 'Elle', 'Finn', 'Gus', 'Hana', 'Ivo', 'Jade', 'Kai', 'Lena',
  'Milo', 'Nora', 'Otis', 'Pia', 'Quin', 'Rosa', 'Sam', 'Tess', 'Uma', 'Vic', 'Wes', 'Zoe',
];
