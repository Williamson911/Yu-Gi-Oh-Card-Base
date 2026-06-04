import { canAddCard, validateDeck, BanStatus } from './deck-validation';
import { Deck, DeckCard } from '../models/deck';

function emptyDeck(): Deck {
  return { id: 'd', ownerId: 'test-user', name: 'D', main: [], extra: [], side: [], createdAt: 0, updatedAt: 0 };
}

function dc(cardId: number, count: number, frameType = 'effect'): DeckCard {
  return {
    cardId,
    count,
    snapshot: {
      name: `c${cardId}`, image_url_small: '', frameType,
      type: frameType === 'spell' ? 'Spell Card' : 'Effect Monster',
      race: 'Spellcaster',
    },
  };
}

const monster = (id: number, frameType = 'effect') => ({
  id, name: `m${id}`, frameType, type: 'Effect Monster',
  race: 'Spellcaster', card_images: [{ image_url_small: '' }],
} as any);

const fusion = (id: number) => monster(id, 'fusion');

const ban = (m: Record<number, BanStatus> = {}) => ({
  get: (id: number) => m[id],
  maxCopies: (id: number) => {
    const s = m[id];
    if (s === 'Banned') return 0;
    if (s === 'Limited') return 1;
    if (s === 'Semi-Limited') return 2;
    return 3;
  },
});

describe('canAddCard — copies', () => {
  it('allows up to 3 copies of an unrestricted card', () => {
    const d = emptyDeck();
    expect(canAddCard(d, 'main', monster(1), ban()).allowed).toBe(true);
    d.main.push(dc(1, 3));
    expect(canAddCard(d, 'main', monster(1), ban()).allowed).toBe(false);
  });

  it('counts copies across main + extra + side', () => {
    const d = emptyDeck();
    d.main.push(dc(1, 2));
    d.side.push(dc(1, 1));
    expect(canAddCard(d, 'main', monster(1), ban()).allowed).toBe(false);
  });
});

describe('canAddCard — ban list', () => {
  it('refuses any copy of a Banned card', () => {
    const r = canAddCard(emptyDeck(), 'main', monster(1), ban({ 1: 'Banned' }));
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/interdite/i);
  });

  it('allows 1 copy of a Limited card, refuses 2nd', () => {
    const d = emptyDeck();
    const b = ban({ 1: 'Limited' });
    expect(canAddCard(d, 'main', monster(1), b).allowed).toBe(true);
    d.main.push(dc(1, 1));
    expect(canAddCard(d, 'main', monster(1), b).allowed).toBe(false);
  });

  it('allows 2 copies of a Semi-Limited card, refuses 3rd', () => {
    const d = emptyDeck();
    const b = ban({ 1: 'Semi-Limited' });
    d.main.push(dc(1, 2));
    expect(canAddCard(d, 'main', monster(1), b).allowed).toBe(false);
  });
});

describe('canAddCard — section limits', () => {
  it('refuses main when at 60', () => {
    const d = emptyDeck();
    d.main.push(dc(99, 60));
    expect(canAddCard(d, 'main', monster(1), ban()).allowed).toBe(false);
  });

  it('refuses extra when at 15', () => {
    const d = emptyDeck();
    d.extra.push(dc(99, 15, 'fusion'));
    expect(canAddCard(d, 'extra', fusion(1), ban()).allowed).toBe(false);
  });

  it('refuses side when at 15', () => {
    const d = emptyDeck();
    d.side.push(dc(99, 15));
    expect(canAddCard(d, 'side', monster(1), ban()).allowed).toBe(false);
  });

  it('refuses adding a main-only card to extra', () => {
    expect(canAddCard(emptyDeck(), 'extra', monster(1, 'effect'), ban()).allowed).toBe(false);
  });

  it('refuses adding an extra-only card to main', () => {
    expect(canAddCard(emptyDeck(), 'main', fusion(1), ban()).allowed).toBe(false);
  });

  it('allows any card type in side', () => {
    expect(canAddCard(emptyDeck(), 'side', monster(1), ban()).allowed).toBe(true);
    expect(canAddCard(emptyDeck(), 'side', fusion(2), ban()).allowed).toBe(true);
  });
});

describe('validateDeck', () => {
  it('returns no issues for an empty deck (only warning: too small)', () => {
    const issues = validateDeck(emptyDeck(), ban());
    expect(issues.some((i) => i.kind === 'main-too-small')).toBe(true);
  });

  it('flags main < 40 as warning', () => {
    const d = emptyDeck();
    d.main.push(dc(1, 39));
    const issues = validateDeck(d, ban());
    const w = issues.find((i) => i.kind === 'main-too-small');
    expect(w?.severity).toBe('warning');
  });

  it('no main-too-small at exactly 40', () => {
    const d = emptyDeck();
    d.main.push(dc(1, 3), dc(2, 3), dc(3, 3), dc(4, 3), dc(5, 3), dc(6, 3),
                dc(7, 3), dc(8, 3), dc(9, 3), dc(10, 3), dc(11, 3), dc(12, 3),
                dc(13, 3), dc(14, 1));
    expect(d.main.reduce((s, c) => s + c.count, 0)).toBe(40);
    expect(validateDeck(d, ban()).some((i) => i.kind === 'main-too-small')).toBe(false);
  });

  it('flags main > 60 as error', () => {
    const d = emptyDeck();
    d.main.push(dc(1, 61));
    expect(validateDeck(d, ban()).some(
      (i) => i.kind === 'main-too-large' && i.severity === 'error'
    )).toBe(true);
  });

  it('flags forbidden card in any section', () => {
    const d = emptyDeck();
    d.main.push(dc(7, 1));
    const issues = validateDeck(d, ban({ 7: 'Banned' }));
    expect(issues.some(
      (i) => i.kind === 'forbidden-present' && i.cardId === 7
    )).toBe(true);
  });

  it('flags over-limit copies after a ban list change', () => {
    const d = emptyDeck();
    d.main.push(dc(7, 3));
    const issues = validateDeck(d, ban({ 7: 'Limited' }));
    expect(issues.some(
      (i) => i.kind === 'over-limit-copies' && i.cardId === 7
    )).toBe(true);
  });
});
