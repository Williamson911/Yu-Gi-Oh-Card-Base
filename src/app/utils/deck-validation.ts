import { Daum } from '../models/yu-gi-result';
import { Deck, DeckCard, DeckSectionId } from '../models/deck';
import { isExtraDeckMonster } from './deck-rules';

export type BanStatus = 'Banned' | 'Limited' | 'Semi-Limited';

export interface BanlistLike {
  get(cardId: number): BanStatus | undefined;
  maxCopies(cardId: number): 0 | 1 | 2 | 3;
}

export type DeckIssueKind =
  | 'main-too-small'
  | 'main-too-large'
  | 'extra-too-large'
  | 'side-too-large'
  | 'forbidden-present'
  | 'over-limit-copies'
  | 'too-many-copies';

export interface DeckIssue {
  kind: DeckIssueKind;
  severity: 'error' | 'warning';
  message: string;
  cardId?: number;
}

export interface AddCheck {
  allowed: boolean;
  reason?: string;
}

const SECTION_LIMITS = { main: 60, extra: 15, side: 15 } as const;

function totalCopies(deck: Deck, cardId: number): number {
  const sum = (list: DeckCard[]) =>
    list.reduce((s, c) => (c.cardId === cardId ? s + c.count : s), 0);
  return sum(deck.main) + sum(deck.extra) + sum(deck.side);
}

function sectionSize(deck: Deck, section: DeckSectionId): number {
  return deck[section].reduce((s, c) => s + c.count, 0);
}

export function canAddCard(
  deck: Deck,
  section: DeckSectionId,
  card: Daum,
  banlist: BanlistLike,
): AddCheck {
  const isExtra = isExtraDeckMonster(card);

  if (section === 'main' && isExtra) {
    return { allowed: false, reason: "Cette carte va dans l’Extra Deck" };
  }
  if (section === 'extra' && !isExtra) {
    return { allowed: false, reason: "Cette carte ne va pas dans l’Extra Deck" };
  }

  if (sectionSize(deck, section) >= SECTION_LIMITS[section]) {
    return {
      allowed: false,
      reason: section === 'main'
        ? 'Main Deck déjà à 60 cartes'
        : section === 'extra'
        ? 'Extra Deck déjà à 15 cartes'
        : 'Side Deck déjà à 15 cartes',
    };
  }

  const status = banlist.get(card.id);
  if (status === 'Banned') {
    return { allowed: false, reason: 'Carte interdite en TCG' };
  }

  const limit = banlist.maxCopies(card.id);
  if (totalCopies(deck, card.id) >= limit) {
    if (status === 'Limited') {
      return { allowed: false, reason: 'Carte Limitée — déjà 1 exemplaire' };
    }
    if (status === 'Semi-Limited') {
      return { allowed: false, reason: 'Carte Semi-Limitée — déjà 2 exemplaires' };
    }
    return { allowed: false, reason: 'Maximum 3 exemplaires atteint' };
  }

  return { allowed: true };
}

export function validateDeck(deck: Deck, banlist: BanlistLike): DeckIssue[] {
  const issues: DeckIssue[] = [];
  const mainSize = sectionSize(deck, 'main');
  const extraSize = sectionSize(deck, 'extra');
  const sideSize = sectionSize(deck, 'side');

  if (mainSize < 40) {
    issues.push({
      kind: 'main-too-small',
      severity: 'warning',
      message: `Main Deck incomplet (${mainSize}/40)`,
    });
  }
  if (mainSize > 60) {
    issues.push({
      kind: 'main-too-large',
      severity: 'error',
      message: `Main Deck trop grand (${mainSize}/60)`,
    });
  }
  if (extraSize > 15) {
    issues.push({
      kind: 'extra-too-large',
      severity: 'error',
      message: `Extra Deck trop grand (${extraSize}/15)`,
    });
  }
  if (sideSize > 15) {
    issues.push({
      kind: 'side-too-large',
      severity: 'error',
      message: `Side Deck trop grand (${sideSize}/15)`,
    });
  }

  const allCardIds = new Set<number>([
    ...deck.main.map((c) => c.cardId),
    ...deck.extra.map((c) => c.cardId),
    ...deck.side.map((c) => c.cardId),
  ]);

  for (const id of allCardIds) {
    const total = totalCopies(deck, id);
    const status = banlist.get(id);
    if (status === 'Banned' && total > 0) {
      const name = cardName(deck, id);
      issues.push({
        kind: 'forbidden-present',
        severity: 'error',
        message: `${name} est Interdite en TCG`,
        cardId: id,
      });
      continue;
    }
    const limit = banlist.maxCopies(id);
    if (total > limit) {
      const name = cardName(deck, id);
      const kind = limit === 3 ? 'too-many-copies' : 'over-limit-copies';
      issues.push({
        kind,
        severity: 'error',
        message: `${name} : ${total} exemplaires (max ${limit})`,
        cardId: id,
      });
    }
  }

  return issues;
}

function cardName(deck: Deck, cardId: number): string {
  const find = (list: DeckCard[]) => list.find((c) => c.cardId === cardId);
  const hit = find(deck.main) ?? find(deck.extra) ?? find(deck.side);
  return hit?.snapshot.name ?? `Carte #${cardId}`;
}
