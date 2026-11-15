import { useState } from 'preact/hooks';
import { parseCards, makeCard } from '../engine/cards';
import { chenScore } from '../ai/preflop';
import { TIER_INFO, TIER_ORDER, tierFromScore, type Tier } from '../coach/coach';
import { CardView } from './CardView';

type Tab = 'rankings' | 'starting' | 'odds';

const RANKINGS: { name: string; cards: string; desc: string; odds: string }[] = [
  { name: 'Royal Flush', cards: 'As Ks Qs Js Ts', desc: 'A-K-Q-J-10, all the same suit. The best possible hand.', odds: '0.003%' },
  { name: 'Straight Flush', cards: '9h 8h 7h 6h 5h', desc: 'Five cards in a row, all the same suit.', odds: '0.03%' },
  { name: 'Four of a Kind', cards: 'Qc Qd Qh Qs 7d', desc: 'All four cards of one rank ("quads").', odds: '0.17%' },
  { name: 'Full House', cards: 'Kc Kd Kh 4s 4c', desc: 'Three of a kind plus a pair. Ranked by the three first: KKK44 beats QQQAA.', odds: '2.6%' },
  { name: 'Flush', cards: 'Ad Jd 8d 6d 2d', desc: 'Any five cards of the same suit. Highest card decides ties.', odds: '3.0%' },
  { name: 'Straight', cards: 'Tc 9d 8s 7h 6c', desc: 'Five cards in a row, mixed suits. Ace can be high (10-J-Q-K-A) or low (A-2-3-4-5).', odds: '4.6%' },
  { name: 'Three of a Kind', cards: '7c 7d 7s Kh 2c', desc: 'Three cards of one rank. With a pocket pair it\'s called a "set".', odds: '4.8%' },
  { name: 'Two Pair', cards: 'Jh Js 5c 5d Ac', desc: 'Two different pairs. Highest pair decides, then the second, then the kicker.', odds: '23.5%' },
  { name: 'One Pair', cards: 'Ts Th Ad 8c 3s', desc: 'Two cards of the same rank. The "kicker" (highest other card) breaks ties.', odds: '43.8%' },
  { name: 'High Card', cards: 'Ah Qc 9d 6s 3h', desc: 'Nothing above. Your highest card plays.', odds: '17.4%' },
];

const RANKS = 'AKQJT98765432';

/** Tier for grid cell (row r, col c) of the 13×13 starting-hand chart. */
function cellHand(r: number, c: number): { name: string; tier: Tier } {
  const hi = RANKS[Math.min(r, c)]!;
  const lo = RANKS[Math.max(r, c)]!;
  const rankVal = (ch: string) => 14 - RANKS.indexOf(ch);
  const suited = c > r; // upper-right triangle = suited
  const pair = r === c;
  const a = makeCard(rankVal(hi), 0);
  const b = makeCard(rankVal(lo), suited ? 0 : 1);
  const name = pair ? hi + lo : hi + lo + (suited ? 's' : 'o');
  return { name, tier: tierFromScore(chenScore([a, b]), pair) };
}

export function Guide({ onClose, highlight, initialTab = 'rankings' }: { onClose: () => void; highlight?: string; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [picked, setPicked] = useState<{ name: string; tier: Tier } | null>(null);

  return (
    <div class="guide">
      <header class="topbar">
        <span />
        <div class="topbar-title">Poker Guide</div>
        <button class="btn-link" onClick={onClose}>Done</button>
      </header>
      <div class="seg guide-tabs">
        {([['rankings', 'Hand Rankings'], ['starting', 'Starting Hands'], ['odds', 'Pot Odds']] as [Tab, string][]).map(([t, label]) => (
          <button class={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      <div class="guide-body">
        {tab === 'rankings' && (
          <>
            <p class="guide-intro">
              Your best <b>five</b> cards count, using your two cards and the five on the board in any combination.
              Higher on this list beats lower. Percentages show how often you end up with each hand by the river.
            </p>
            {RANKINGS.map((h, i) => (
              <div class="rank-row">
                <div class="rank-head">
                  <span class="rank-num">{i + 1}</span>
                  <span class="rank-name">{h.name}</span>
                  <span class="rank-odds">{h.odds}</span>
                </div>
                <div class="rank-cards">
                  {parseCards(h.cards).map((c) => <CardView card={c} size="sm" />)}
                </div>
                <div class="rank-desc">{h.desc}</div>
              </div>
            ))}
          </>
        )}

        {tab === 'starting' && (
          <>
            <p class="guide-intro">
              All 169 starting hands. <b>Pairs</b> on the diagonal, <b>suited</b> hands (same suit, "s") top-right,
              <b> offsuit</b> ("o") bottom-left. Tap a hand.
            </p>
            <div class="grid13">
              {Array.from({ length: 13 }, (_, r) =>
                Array.from({ length: 13 }, (_, c) => {
                  const h = cellHand(r, c);
                  return (
                    <button
                      class={`cell${h.name === highlight ? ' cell-me' : ''}${picked?.name === h.name ? ' cell-picked' : ''}`}
                      style={{ background: TIER_INFO[h.tier].color }}
                      onClick={() => setPicked(h)}
                    >
                      {h.name.slice(0, 2)}
                    </button>
                  );
                }),
              )}
            </div>
            {picked && (
              <div class="picked">
                <b>{picked.name}</b>: {TIER_INFO[picked.tier].label}. {TIER_INFO[picked.tier].summary}
              </div>
            )}
            <div class="legend">
              {TIER_ORDER.map((t) => (
                <div class="legend-row">
                  <span class="swatch" style={{ background: TIER_INFO[t].color }} />
                  <span><b>{TIER_INFO[t].label}</b>: {TIER_INFO[t].summary}</span>
                </div>
              ))}
            </div>
            <p class="guide-intro">
              <b>Position matters.</b> The later you act (Cutoff, Button), the more hands you can play, because you see
              what everyone else does first. From early position (UTG) stick to Premium, Strong and the best Playable hands.
            </p>
          </>
        )}

        {tab === 'odds' && (
          <div class="odds-guide">
            <h3>Pot odds: should I call?</h3>
            <p>Compare <b>what you must pay</b> to <b>what you can win</b>.</p>
            <div class="formula">Needed win chance = call ÷ (pot + call)</div>
            <p>
              Example: the pot is 300 and someone bets 100 (pot now 400). You must call 100 to win 400:
              100 ÷ (400 + 100) = <b>20%</b>. If you win more than 20% of the time, calling makes money long-term.
            </p>
            <h3>Outs</h3>
            <p>An <b>out</b> is a card that would give you the winning hand.</p>
            <table class="outs">
              <thead><tr><th>Draw</th><th>Outs</th><th>Next card</th><th>By river</th></tr></thead>
              <tbody>
                <tr><td>Flush draw (4 to a flush)</td><td>9</td><td>19%</td><td>35%</td></tr>
                <tr><td>Open-ended straight (5-6-7-8)</td><td>8</td><td>17%</td><td>32%</td></tr>
                <tr><td>Two overcards (AK on 7-4-2)</td><td>6</td><td>13%</td><td>24%</td></tr>
                <tr><td>Gutshot straight (5-6-_-8-9)</td><td>4</td><td>9%</td><td>17%</td></tr>
                <tr><td>Pocket pair → set</td><td>2</td><td>4%</td><td>8%</td></tr>
                <tr><td>Flush + straight draw</td><td>15</td><td>33%</td><td>54%</td></tr>
              </tbody>
            </table>
            <h3>Rule of 2 and 4</h3>
            <p>
              Quick mental math: on the flop, <b>outs × 4</b> ≈ your % to hit by the river. On the turn, <b>outs × 2</b> ≈
              your % to hit on the river. A flush draw on the flop: 9 × 4 ≈ 36%.
            </p>
            <h3>Putting it together</h3>
            <p>
              You have a flush draw on the turn (9 outs × 2 ≈ 18%). Opponent bets 100 into 100: you need
              100 ÷ 300 ≈ 33%. 18% &lt; 33%, so <b>fold</b>. If they bet only 20 into 100, you need 20 ÷ 140 ≈ 14%.
              Now <b>call</b>.
            </p>
            <p class="muted">The coach panel at the table does this maths for you every hand. Use it to check your own estimates.</p>
          </div>
        )}
      </div>
    </div>
  );
}
