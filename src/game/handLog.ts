/** Turn engine events into readable lines for the hand log. */
import type { HandEvent } from '../engine/holdem';
import { type Card, rankChar, rankOf, suitOf, SUIT_SYMBOLS } from '../engine/cards';

export const pretty = (c: Card) => rankChar(rankOf(c)) + SUIT_SYMBOLS[suitOf(c)];
export const prettyCards = (cs: readonly Card[]) => cs.map(pretty).join(' ');
export const chips = (n: number) => n.toLocaleString('en-US');

export function eventText(e: HandEvent, name: (id: string) => string): string | null {
  // "You fold" but "Ava folds".
  const v = (id: string, verb: string) => (name(id) === 'You' ? verb : `${verb}s`);
  switch (e.type) {
    case 'ante':
      return null;
    case 'blind':
      return `${name(e.id)} ${v(e.id, 'post')} ${e.kind} blind ${chips(e.amount)}`;
    case 'deal':
      return null;
    case 'action': {
      const allIn = e.allIn ? ' (all-in)' : '';
      switch (e.action) {
        case 'fold': return `${name(e.id)} ${v(e.id, 'fold')}`;
        case 'check': return `${name(e.id)} ${v(e.id, 'check')}`;
        case 'call': return `${name(e.id)} ${v(e.id, 'call')}${allIn}`;
        case 'bet': return `${name(e.id)} ${v(e.id, 'bet')} ${chips(e.to)}${allIn}`;
        case 'raise': return `${name(e.id)} ${v(e.id, 'raise')} to ${chips(e.to)}${allIn}`;
      }
      return null;
    }
    case 'street': {
      const label = e.street[0]!.toUpperCase() + e.street.slice(1);
      return `— ${label}: ${prettyCards(e.board)}`;
    }
    case 'refund':
      return `${chips(e.amount)} returned to ${name(e.id)}`;
    case 'show':
      return `${name(e.id)} ${v(e.id, 'show')} ${prettyCards(e.hole)} (${e.description})`;
    case 'win':
      return `${name(e.id)} ${v(e.id, 'win')} ${chips(e.amount)}${e.description ? ` with ${e.description}` : ''}`;
  }
}
