/**
 * Card primitives.
 *
 * A card is a small integer 0..51 so it is cheap to copy and compare during
 * simulations: card = (rank - 2) * 4 + suit.
 *   rank: 2..14 (11 = J, 12 = Q, 13 = K, 14 = A)
 *   suit: 0 = clubs, 1 = diamonds, 2 = hearts, 3 = spades
 */
export type Card = number;

export const SUITS = ['c', 'd', 'h', 's'] as const;
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'] as const;
export const RANK_CHARS = '23456789TJQKA';

export const rankOf = (c: Card): number => (c >> 2) + 2;
export const suitOf = (c: Card): number => c & 3;
export const makeCard = (rank: number, suit: number): Card => ((rank - 2) << 2) | suit;

export function rankChar(rank: number): string {
  const ch = RANK_CHARS[rank - 2];
  if (!ch) throw new Error(`Invalid rank ${rank}`);
  return ch;
}

/** "As" -> card, "Td" -> card. Accepts "10" for ten. */
export function parseCard(s: string): Card {
  const str = s.trim().replace(/^10/, 'T');
  if (str.length !== 2) throw new Error(`Invalid card "${s}"`);
  const rank = RANK_CHARS.indexOf(str[0]!.toUpperCase()) + 2;
  const suit = SUITS.indexOf(str[1]!.toLowerCase() as (typeof SUITS)[number]);
  if (rank < 2 || suit < 0) throw new Error(`Invalid card "${s}"`);
  return makeCard(rank, suit);
}

/** "As Kd 7h" -> cards */
export function parseCards(s: string): Card[] {
  return s.trim() === '' ? [] : s.trim().split(/\s+/).map(parseCard);
}

export function cardToString(c: Card): string {
  return rankChar(rankOf(c)) + SUITS[suitOf(c)];
}

export function cardsToString(cards: readonly Card[]): string {
  return cards.map(cardToString).join(' ');
}

export function fullDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
}

export const RANK_NAMES: Record<number, [singular: string, plural: string]> = {
  2: ['Two', 'Twos'], 3: ['Three', 'Threes'], 4: ['Four', 'Fours'], 5: ['Five', 'Fives'],
  6: ['Six', 'Sixes'], 7: ['Seven', 'Sevens'], 8: ['Eight', 'Eights'], 9: ['Nine', 'Nines'],
  10: ['Ten', 'Tens'], 11: ['Jack', 'Jacks'], 12: ['Queen', 'Queens'], 13: ['King', 'Kings'],
  14: ['Ace', 'Aces'],
};
