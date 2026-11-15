/**
 * Local persistence (localStorage). Everything stays on the phone.
 * Every access is wrapped so the app still works if storage is unavailable.
 */
const KEY = 'poker-trainer:v1';

export interface SavedState {
  /** Chips not currently on a table. */
  bankroll: number;
  /** Chips on the table when the app was last closed mid-session. */
  tableStack: number;
  settings: Settings;
  stats: { handsPlayed: number; biggestPot: number };
}

export interface Settings {
  /** Milliseconds a bot "thinks" before acting. */
  botDelay: number;
  /** Show bot style labels (Rock, Maniac…) at the table. */
  showStyles: boolean;
}

export const STARTING_BANKROLL = 20_000;

export const defaultState = (): SavedState => ({
  bankroll: STARTING_BANKROLL,
  tableStack: 0,
  settings: { botDelay: 700, showStyles: true },
  stats: { handsPlayed: 0, biggestPot: 0 },
});

export function load(): SavedState {
  const d = defaultState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<SavedState>;
    return {
      ...d,
      ...s,
      settings: { ...d.settings, ...s.settings },
      stats: { ...d.stats, ...s.stats },
    };
  } catch {
    return d;
  }
}

export function save(state: SavedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable (private mode) – keep playing without saving */
  }
}
