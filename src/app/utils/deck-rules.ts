import { Daum } from '../models/yu-gi-result';
import { DeckCardSnapshot } from '../models/deck';

const EXTRA_FRAMES = ['fusion', 'synchro', 'xyz', 'link'] as const;

export function isExtraDeckMonster(card: Pick<Daum, 'frameType'>): boolean {
  const ft = (card?.frameType ?? '').toLowerCase();
  return EXTRA_FRAMES.some((f) => ft.startsWith(f));
}

export function defaultSectionFor(card: Pick<Daum, 'frameType'>): 'main' | 'extra' {
  return isExtraDeckMonster(card) ? 'extra' : 'main';
}

export function snapshotOf(card: Daum): DeckCardSnapshot {
  const firstSet = card.card_sets?.[0];
  return {
    name: card.name,
    image_url_small: card.card_images?.[0]?.image_url_small ?? '',
    frameType: card.frameType,
    type: card.type,
    race: card.race,
    attribute: card.attribute,
    level: card.level,
    atk: card.atk,
    def: card.def,
    set_code: firstSet?.set_code,
    set_name: firstSet?.set_name,
  };
}
