# Poker Trainer

An offline poker app for iPhone, built as a Progressive Web App (PWA). You play
against computer players of different skill levels and bluffing styles to get
better at poker. Fake chips only: no real money, no accounts, no server.

## Plan

| Phase | What | Status |
|---|---|---|
| 1 | Game engine: cards, hand evaluator, betting rules, side pots, equity | ✅ done |
| 2 | Playable table: cash game vs simple bots, installable offline PWA | next |
| 3 | Bot personalities: skill levels, tight/loose, bluff frequency, tilt | |
| 4 | Tournament mode (Sit & Go): rising blinds, payouts | |
| 5 | Coach: live odds, hints, hand review, stats | |
| 6 | Polish: animations, sound, haptics, settings | |

Target device: iPhone SE (3rd gen), portrait 375×667.

## Layout

```
src/engine/   rules and maths, no UI (fully unit-tested)
  cards.ts      card encoding and parsing
  rng.ts        seedable shuffle (reproducible hands)
  evaluator.ts  fast 5-7 card hand ranking
  pots.ts       main and side pots, split pots
  holdem.ts     No-Limit Hold'em hand state machine
  equity.ts     Monte Carlo win probability, pot odds
tests/        vitest
```

## Develop

```bash
npm install
npm test
```
