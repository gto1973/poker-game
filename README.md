# Poker Trainer

An offline poker app for iPhone, built as a Progressive Web App (PWA). You play
against computer players of different skill levels and bluffing styles to get
better at poker. Fake chips only: no real money, no accounts, no server.

## Plan

| Phase | What | Status |
|---|---|---|
| 1 | Game engine: cards, hand evaluator, betting rules, side pots, equity | ✅ done |
| 2 | Playable table: cash game vs simple bots, installable offline PWA | ✅ done |
| 3 | Bot personalities: skill levels, tight/loose, bluff frequency, tilt | next (6 basic styles in place) |
| 4 | Tournament mode (Sit & Go): rising blinds, payouts | |
| 5 | Coach: live odds, hints, hand review, stats | ✅ odds, hints & guide done (hand review, stats to come) |
| 6 | Polish: animations, sound, haptics, settings | |

Target device: iPhone SE (3rd gen), portrait 375×667.

## Install on iPhone

1. Open **https://gto1973.github.io/poker-game/** in **Safari**.
2. Tap the Share button → **Add to Home Screen**.
3. Launch it from the home screen. After the first launch it works in airplane mode.

New versions download automatically the next time you open the app while online.

## Layout

```
src/engine/   rules and maths, no UI (fully unit-tested)
  cards.ts      card encoding and parsing
  rng.ts        seedable shuffle (reproducible hands)
  evaluator.ts  fast 5-7 card hand ranking
  pots.ts       main and side pots, split pots
  holdem.ts     No-Limit Hold'em hand state machine
  equity.ts     Monte Carlo win probability, pot odds
src/ai/       bots: Chen-formula preflop, Monte Carlo postflop, personalities
src/coach/    hand tiers, win chance, pot odds, advice (never sees opponents' cards)
src/game/     cash game table (seating, button, bot replacement), hand log
src/storage/  bankroll and settings in localStorage
src/ui/       Preact components and CSS
tests/        vitest
```

## Develop

```bash
npm install
npm test          # unit tests
npm run dev       # local dev server
npm run build     # production build in dist/ (includes offline service worker)
```

Pushes to the main or development branch are tested and deployed to GitHub Pages by
`.github/workflows/deploy.yml`.
