export type DeckSectionId = 'main' | 'extra' | 'side';

export interface DeckCardSnapshot {
  name: string;
  image_url_small: string;
  frameType: string;
  type: string;
  race: string;
  attribute?: string;
  level?: number;
  atk?: number;
  def?: number;
  set_code?: string;
  set_name?: string;
}

export interface DeckCard {
  cardId: number;
  count: number;
  snapshot: DeckCardSnapshot;
}

export interface Deck {
  id: string;
  ownerId: string;
  name: string;
  main: DeckCard[];
  extra: DeckCard[];
  side: DeckCard[];
  createdAt: number;
  updatedAt: number;
}

export interface DeckContent {
  name: string;
  main: DeckCard[];
  extra: DeckCard[];
  side: DeckCard[];
}
