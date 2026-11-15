import { type Card, rankOf, suitOf, rankChar, SUIT_SYMBOLS } from '../engine/cards';

interface Props {
  card?: Card;
  /** Face-down card back. */
  hidden?: boolean;
  size?: 'sm' | 'md' | 'lg';
  dim?: boolean;
  highlight?: boolean;
}

export function CardView({ card, hidden, size = 'md', dim, highlight }: Props) {
  const cls = `card card-${size}${dim ? ' card-dim' : ''}${highlight ? ' card-hl' : ''}`;
  if (hidden || card === undefined) return <div class={`${cls} card-back`} />;
  const suit = suitOf(card);
  const rank = rankChar(rankOf(card));
  const red = suit === 1 || suit === 2;
  return (
    <div class={`${cls}${red ? ' card-red' : ''}`} aria-label={`${rank}${'cdhs'[suit]}`}>
      <span class="card-rank">{rank === 'T' ? '10' : rank}</span>
      <span class="card-suit">{SUIT_SYMBOLS[suit]}</span>
    </div>
  );
}

/** Empty slot showing where a board card will go. */
export function CardSlot({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <div class={`card card-${size} card-slot`} />;
}
