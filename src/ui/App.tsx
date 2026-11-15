import { useEffect, useState } from 'preact/hooks';
import { load, save, defaultState, STARTING_BANKROLL, type SavedState } from '../storage/storage';
import { CashTable, CASH_BUY_IN, CASH_BLINDS } from './CashTable';
import { chips } from './format';

type Screen = 'home' | 'cash';

const SPEEDS: [label: string, ms: number][] = [['Slow', 1300], ['Normal', 700], ['Fast', 300]];

export function App() {
  const [state, setState] = useState<SavedState>(load);
  const [screen, setScreen] = useState<Screen>('home');
  const [tableStart, setTableStart] = useState(0);

  const update = (fn: (s: SavedState) => SavedState) =>
    setState((s) => {
      const n = fn(s);
      save(n);
      return n;
    });

  // If the app was closed mid-session, return those chips to the bankroll.
  useEffect(() => {
    if (state.tableStack > 0) update((s) => ({ ...s, bankroll: s.bankroll + s.tableStack, tableStack: 0 }));
  }, []);

  const sitDown = () => {
    const buyIn = Math.min(CASH_BUY_IN, state.bankroll);
    if (buyIn <= 0) return;
    update((s) => ({ ...s, bankroll: s.bankroll - buyIn, tableStack: buyIn }));
    setTableStart(buyIn);
    setScreen('cash');
  };

  const resetBankroll = () => {
    if (!confirm(`Reset your bankroll to ${chips(STARTING_BANKROLL)} chips? (They're fake chips, so no harm done.)`)) return;
    update((s) => ({ ...defaultState(), settings: s.settings, stats: s.stats }));
  };

  if (screen === 'cash') {
    return (
      <CashTable
        startingStack={tableStart}
        settings={state.settings}
        onHandDone={(stack, pot) =>
          update((s) => ({
            ...s,
            tableStack: stack,
            stats: { handsPlayed: s.stats.handsPlayed + 1, biggestPot: Math.max(s.stats.biggestPot, pot) },
          }))
        }
        onRebuy={() => {
          // Fake chips: if the bankroll is empty, top it back up.
          const bankroll = state.bankroll > 0 ? state.bankroll : STARTING_BANKROLL;
          const amt = Math.min(CASH_BUY_IN, bankroll);
          update((s) => ({ ...s, bankroll: bankroll - amt, tableStack: s.tableStack + amt }));
          return amt;
        }}
        onLeave={(stack) => {
          update((s) => ({ ...s, bankroll: s.bankroll + stack, tableStack: 0 }));
          setScreen('home');
        }}
      />
    );
  }

  const canSit = state.bankroll > 0;
  return (
    <div class="screen home">
      <div class="home-hero">
        <div class="logo">♠</div>
        <h1>Poker Trainer</h1>
        <p class="tagline">Texas Hold'em against bots · fake chips only</p>
      </div>

      <div class="bankroll-card">
        <div class="label">Bankroll</div>
        <div class="value">{chips(state.bankroll)}</div>
        <div class="stats">
          {chips(state.stats.handsPlayed)} hands played · biggest pot {chips(state.stats.biggestPot)}
        </div>
      </div>

      <div class="menu">
        <button class="btn btn-call btn-big" disabled={!canSit} onClick={sitDown}>
          Cash Game
          <small>Blinds {CASH_BLINDS.small}/{CASH_BLINDS.big} · buy-in {chips(Math.min(CASH_BUY_IN, state.bankroll))}</small>
        </button>
        <button class="btn btn-secondary btn-big" disabled>
          Tournament
          <small>Coming soon</small>
        </button>
      </div>

      <div class="settings">
        <div class="setting">
          <span>Bot speed</span>
          <div class="seg">
            {SPEEDS.map(([label, ms]) => (
              <button
                class={state.settings.botDelay === ms ? 'on' : ''}
                onClick={() => update((s) => ({ ...s, settings: { ...s.settings, botDelay: ms } }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div class="setting">
          <span>Show bot styles</span>
          <div class="seg">
            {[true, false].map((v) => (
              <button
                class={state.settings.showStyles === v ? 'on' : ''}
                onClick={() => update((s) => ({ ...s, settings: { ...s.settings, showStyles: v } }))}
              >
                {v ? 'On' : 'Off'}
              </button>
            ))}
          </div>
        </div>
        <button class="btn-link reset" onClick={resetBankroll}>Reset bankroll</button>
      </div>
    </div>
  );
}
