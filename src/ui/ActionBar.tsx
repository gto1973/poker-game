import { useState } from 'preact/hooks';
import type { LegalActions, PlayerAction, Street } from '../engine/holdem';
import { chips } from './format';

interface Props {
  legal: LegalActions;
  pot: number;
  currentBet: number;
  bigBlind: number;
  street: Street;
  onAct: (a: PlayerAction) => void;
}

export function ActionBar({ legal, pot, currentBet, bigBlind, street, onAct }: Props) {
  const [raising, setRaising] = useState(false);
  const [amount, setAmount] = useState(legal.minRaiseTo);
  const canRaise = legal.raiseKind !== null;
  const verb = legal.raiseKind === 'bet' ? 'Bet' : 'Raise';

  const clamp = (x: number) => Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, x));
  const round = (x: number) => (x >= legal.maxRaiseTo ? legal.maxRaiseTo : Math.round(x / (bigBlind / 2)) * (bigBlind / 2));

  const presets: [label: string, to: number][] = [];
  if (canRaise) {
    if (street === 'preflop' && currentBet === bigBlind) {
      for (const x of [2.5, 3, 4]) presets.push([`${x} BB`, bigBlind * x]);
    } else {
      const sized = (f: number) => (legal.raiseKind === 'bet' ? f * pot : currentBet + f * (pot + legal.callAmount));
      presets.push(['½ Pot', sized(0.5)], ['¾ Pot', sized(0.75)], ['Pot', sized(1)]);
    }
    presets.push(['All-in', legal.maxRaiseTo]);
  }

  if (raising && canRaise) {
    const allIn = amount >= legal.maxRaiseTo;
    const step = bigBlind;
    return (
      <div class="action-bar raise-panel">
        <div class="presets">
          {presets.map(([label, to]) => (
            <button class="btn btn-chip" onClick={() => setAmount(clamp(round(to)))}>{label}</button>
          ))}
        </div>
        <div class="slider-row">
          <button class="btn btn-step" onClick={() => setAmount(clamp(amount - step))}>−</button>
          <input
            type="range"
            min={legal.minRaiseTo}
            max={legal.maxRaiseTo}
            step={1}
            value={amount}
            onInput={(e) => setAmount(clamp(round(Number((e.target as HTMLInputElement).value))))}
          />
          <button class="btn btn-step" onClick={() => setAmount(clamp(amount + step))}>+</button>
        </div>
        <div class="buttons">
          <button class="btn btn-secondary" onClick={() => setRaising(false)}>Back</button>
          <button class="btn btn-raise" onClick={() => onAct({ type: legal.raiseKind!, amount })}>
            {allIn ? `All-in ${chips(amount)}` : `${verb} to ${chips(amount)}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="action-bar">
      <div class="buttons">
        {!legal.canCheck && (
          <button class="btn btn-fold" onClick={() => onAct({ type: 'fold' })}>Fold</button>
        )}
        {legal.canCheck ? (
          <button class="btn btn-call" onClick={() => onAct({ type: 'check' })}>Check</button>
        ) : (
          <button class="btn btn-call" onClick={() => onAct({ type: 'call' })}>
            Call {chips(legal.callAmount)}
          </button>
        )}
        {canRaise && (
          <button
            class="btn btn-raise"
            onClick={() => {
              if (legal.minRaiseTo >= legal.maxRaiseTo) {
                onAct({ type: legal.raiseKind!, amount: legal.maxRaiseTo });
                return;
              }
              setAmount(legal.minRaiseTo);
              setRaising(true);
            }}
          >
            {legal.minRaiseTo >= legal.maxRaiseTo ? `All-in ${chips(legal.maxRaiseTo)}` : `${verb}…`}
          </button>
        )}
      </div>
    </div>
  );
}
