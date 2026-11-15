import { useEffect, useRef, useState } from 'preact/hooks';
import { CashGame, HUMAN_ID, type Seat } from '../game/cashGame';
import type { HandEvent, HoldemHand, PlayerAction, PlayerState } from '../engine/holdem';
import { eventText } from '../game/handLog';
import type { Settings } from '../storage/storage';
import { CardView, CardSlot } from './CardView';
import { ActionBar } from './ActionBar';
import { chips, heroHandText } from './format';

export const CASH_BLINDS = { small: 10, big: 20 };
export const CASH_BUY_IN = 2000;

interface Props {
  startingStack: number;
  settings: Settings;
  /** Called after every hand with the human's new stack. */
  onHandDone: (stack: number, pot: number) => void;
  /** Ask the app for more chips from the bankroll. Returns chips granted. */
  onRebuy: () => number;
  onLeave: (stack: number) => void;
}

// Seat positions around the oval, as % of the table area. Seat 0 is you (bottom).
const SEAT_POS: [number, number][] = [
  [50, 87], [12, 69], [12, 25], [50, 11], [88, 25], [88, 69],
];
const CENTER: [number, number] = [50, 48];
const toward = (p: [number, number], t: number): [number, number] => [
  p[0] + (CENTER[0] - p[0]) * t,
  p[1] + (CENTER[1] - p[1]) * t,
];
const at = ([x, y]: [number, number]) => ({ left: `${x}%`, top: `${y}%` });

function lastActionLabel(hand: HoldemHand, p: PlayerState): string {
  if (p.folded) return 'Fold';
  for (let i = hand.events.length - 1; i >= 0; i--) {
    const e = hand.events[i]!;
    if (e.type === 'street') break;
    if (e.type === 'action' && e.id === p.id) {
      if (e.allIn) return 'All-in';
      return { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise' }[e.action];
    }
  }
  return '';
}

export function CashTable({ startingStack, settings, onHandDone, onRebuy, onLeave }: Props) {
  const gameRef = useRef<CashGame | null>(null);
  if (!gameRef.current) {
    gameRef.current = new CashGame({
      smallBlind: CASH_BLINDS.small,
      bigBlind: CASH_BLINDS.big,
      botBuyIn: CASH_BUY_IN,
      humanStack: startingStack,
    });
  }
  const game = gameRef.current;
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);
  const [shownBoard, setShownBoard] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const [infoSeat, setInfoSeat] = useState<Seat | null>(null);
  const reportedHand = useRef(0);

  const deal = () => {
    if (!game.canStartHand()) return;
    game.startHand();
    setShownBoard(0);
    bump();
  };

  useEffect(deal, []);

  const hand = game.hand;
  const boardCaughtUp = !!hand && shownBoard >= hand.board.length;
  const handOver = !!hand && hand.isComplete && boardCaughtUp;

  // Reveal board cards one street at a time (also paces all-in run-outs).
  useEffect(() => {
    if (!hand || shownBoard >= hand.board.length) return;
    const t = setTimeout(() => setShownBoard(shownBoard === 0 ? 3 : shownBoard + 1), shownBoard === 0 ? 350 : 650);
    return () => clearTimeout(t);
  });

  // Bots act after a short "thinking" delay.
  useEffect(() => {
    if (!hand || hand.isComplete || !boardCaughtUp || game.isHumanTurn()) return;
    const t = setTimeout(() => {
      game.botAct();
      bump();
    }, settings.botDelay);
    return () => clearTimeout(t);
  });

  // Report the result once per hand.
  useEffect(() => {
    if (handOver && reportedHand.current !== game.handNumber) {
      reportedHand.current = game.handNumber;
      const pot = hand!.result!.awards.reduce((s, a) => s + a.amount, 0);
      onHandDone(game.human.stack, pot);
    }
  });

  const act = (a: PlayerAction) => {
    game.act(a);
    bump();
  };

  const leave = () => {
    const inHand = hand && !hand.isComplete && hand.players.some((p) => p.id === HUMAN_ID && !p.folded);
    if (inHand && !confirm('Leave now? Chips you have put in this pot are lost.')) return;
    const stack = hand && !hand.isComplete ? (hand.players.find((p) => p.id === HUMAN_ID)?.stack ?? game.human.stack) : game.human.stack;
    onLeave(stack);
  };

  const rebuy = () => {
    const amt = onRebuy();
    if (amt > 0) {
      game.human.stack += amt;
      deal();
    }
  };

  const positions = game.seatPositions();
  const me = hand?.players.find((p) => p.id === HUMAN_ID);
  const board = hand ? hand.board.slice(0, shownBoard) : [];
  const shows = new Map<string, Extract<HandEvent, { type: 'show' }>>();
  if (handOver) for (const e of hand!.events) if (e.type === 'show') shows.set(e.id, e);
  const winners = handOver ? hand!.result!.winnings : {};
  const collectedPot = hand ? hand.potTotal - hand.players.reduce((s, p) => s + p.bet, 0) : 0;
  const humanTurn = game.isHumanTurn() && boardCaughtUp;
  const net = handOver && me ? hand!.result!.net[HUMAN_ID]! : 0;

  return (
    <div class="screen table-screen">
      <header class="topbar">
        <button class="btn-link" onClick={leave}>‹ Leave</button>
        <div class="topbar-title">Cash · {chips(CASH_BLINDS.small)}/{chips(CASH_BLINDS.big)}</div>
        <button class="btn-link" onClick={() => setShowLog(!showLog)}>{showLog ? 'Table' : 'Log'}</button>
      </header>

      <div class="table-area">
        <div class="felt" />

        {game.seats.map((seat, i) => {
          const p = hand?.players.find((x) => x.id === seat.id);
          const isButton = !!hand && game.buttonSeat === i;
          const acting = !!hand && !hand.isComplete && boardCaughtUp && hand.toActId === seat.id;
          const won = (winners[seat.id] ?? 0) > 0;
          const show = shows.get(seat.id);
          const action = p && hand ? lastActionLabel(hand, p) : '';
          const stack = p ? p.stack : seat.stack;
          return (
            <>
              <div
                class={`seat${acting ? ' seat-acting' : ''}${p?.folded ? ' seat-folded' : ''}${won ? ' seat-won' : ''}${seat.isHuman ? ' seat-me' : ''}`}
                style={at(SEAT_POS[i]!)}
                onClick={() => !seat.isHuman && setInfoSeat(seat)}
              >
                {!seat.isHuman && p && !p.folded && (
                  <div class="seat-cards">
                    {show ? (
                      show.hole.map((c) => <CardView card={c} size="sm" />)
                    ) : (
                      <>
                        <CardView hidden size="sm" />
                        <CardView hidden size="sm" />
                      </>
                    )}
                  </div>
                )}
                <div class="seat-box">
                  <div class="seat-name">
                    {seat.name}
                    {positions[i] && <span class="pos">{positions[i]}</span>}
                  </div>
                  <div class="seat-stack">{stack > 0 ? chips(stack) : p?.allIn ? 'All-in' : 'Out'}</div>
                  {settings.showStyles && seat.profile && <div class="seat-style">{seat.profile.style}</div>}
                </div>
                {won ? (
                  <div class="seat-action act-win">+{chips(winners[seat.id]!)}</div>
                ) : (
                  action && !handOver && !p?.folded && (
                    <div class={`seat-action act-${action.toLowerCase().replace(/[^a-z]/g, '')}`}>{action}</div>
                  )
                )}
                {show && <div class="seat-hand">{show.description}</div>}
              </div>
              {p && p.bet > 0 && !handOver && (
                <div class="bet" style={at(toward(SEAT_POS[i]!, 0.42))}>
                  <span class="chip-dot" />
                  {chips(p.bet)}
                </div>
              )}
              {isButton && <div class="dealer-btn" style={at(toward([SEAT_POS[i]![0] + (i === 0 || i === 3 ? 17 : i < 3 ? 6 : -6), SEAT_POS[i]![1] + (i === 3 ? 3 : 0)], 0.22))}>D</div>}
            </>
          );
        })}

        <div class="center">
          <div class="board">
            {[0, 1, 2, 3, 4].map((k) => (board[k] !== undefined ? <CardView card={board[k]} /> : <CardSlot />))}
          </div>
          {hand && collectedPot > 0 && !handOver && <div class="pot">Pot {chips(collectedPot)}</div>}
        </div>

        {showLog && (
          <div class="log-panel" onClick={() => setShowLog(false)}>
            <div class="log-title">Hand #{game.handNumber}</div>
            {hand?.events.map((e) => {
              const t = eventText(e, game.nameOf);
              return t ? <div class={`log-line${e.type === 'street' ? ' log-street' : ''}`}>{t}</div> : null;
            })}
          </div>
        )}

        {infoSeat?.profile && (
          <div class="modal-backdrop" onClick={() => setInfoSeat(null)}>
            <div class="modal">
              <div class="modal-title">{infoSeat.name}</div>
              <div class="modal-sub">{infoSeat.profile.style}</div>
              <p>{infoSeat.profile.tip}</p>
              <button class="btn btn-call">OK</button>
            </div>
          </div>
        )}
      </div>

      <footer class="hero">
        <div class="hero-cards">
          {me ? (
            me.hole.map((c) => <CardView card={c} size="lg" dim={me.folded} />)
          ) : (
            <>
              <CardSlot size="lg" />
              <CardSlot size="lg" />
            </>
          )}
          <div class="hero-info">
            <div class="hero-hand">{me && !me.folded ? heroHandText(me.hole, board) : me?.folded ? 'Folded' : ''}</div>
            <div class="hero-stack">Stack {chips(me ? me.stack : game.human.stack)}</div>
            {handOver && me && net !== 0 && (
              <div class={`hero-net ${net > 0 ? 'pos' : 'neg'}`}>
                {net > 0 ? `You won +${chips(net)}` : `You lost ${chips(-net)}`}
              </div>
            )}
          </div>
        </div>

        {humanTurn && hand ? (
          <ActionBar
            key={`${game.handNumber}-${hand.events.length}`}
            legal={hand.legalActions()}
            pot={hand.potTotal}
            currentBet={hand.currentBet}
            bigBlind={hand.bigBlind}
            street={hand.street}
            onAct={act}
          />
        ) : handOver ? (
          <div class="action-bar">
            {game.tableNews.map((n) => (
              <div class="table-news">{n}</div>
            ))}
            <div class="buttons">
              {game.human.stack > 0 ? (
                <button class="btn btn-call" onClick={deal}>Deal next hand</button>
              ) : (
                <>
                  <button class="btn btn-secondary" onClick={() => onLeave(0)}>Leave</button>
                  <button class="btn btn-raise" onClick={rebuy}>Rebuy {chips(CASH_BUY_IN)}</button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div class="action-bar waiting">
            {hand && !hand.isComplete && hand.toActId ? `${game.nameOf(hand.toActId)} is thinking…` : ''}
          </div>
        )}
      </footer>
    </div>
  );
}
