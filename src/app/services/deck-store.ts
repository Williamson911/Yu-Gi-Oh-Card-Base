import { Injectable, computed, inject, signal, Signal } from '@angular/core';
import { Daum } from '../models/yu-gi-result';
import { Deck, DeckCard, DeckContent, DeckSectionId } from '../models/deck';
import { snapshotOf } from '../utils/deck-rules';
import { AuthService } from './auth-service';

const STORAGE_KEY = 'yugioh.decks.v1';

@Injectable({ providedIn: 'root' })
export class DeckStore {
  private readonly _auth = inject(AuthService);
  private readonly _decks = signal<Deck[]>(this.readAndCleanup());

  readonly decks: Signal<Deck[]> = this._decks.asReadonly();
  readonly myDecks: Signal<Deck[]> = computed(() => {
    const uid = this._auth.currentUserId();
    return uid ? this._decks().filter((d) => d.ownerId === uid) : [];
  });

  get(id: string): Deck | undefined {
    const uid = this._auth.currentUserId();
    if (!uid) return undefined;
    const deck = this._decks().find((d) => d.id === id);
    return deck && deck.ownerId === uid ? deck : undefined;
  }

  create(name: string): Deck | null {
    const uid = this._auth.currentUserId();
    if (!uid) return null;
    const now = Date.now();
    const deck: Deck = {
      id: crypto.randomUUID(),
      ownerId: uid,
      name: name.trim() || 'Nouveau deck',
      main: [], extra: [], side: [],
      createdAt: now, updatedAt: now,
    };
    this._decks.update((arr) => [...arr, deck]);
    this.write();
    return deck;
  }

  rename(id: string, name: string): void {
    this.mutateOwned(id, (d) => ({ ...d, name: name.trim() || d.name }));
  }

  remove(id: string): void {
    const uid = this._auth.currentUserId();
    if (!uid) return;
    this._decks.update((arr) =>
      arr.filter((d) => !(d.id === id && d.ownerId === uid)),
    );
    this.write();
  }

  addCard(id: string, section: DeckSectionId, card: Daum): void {
    this.mutateOwned(id, (d) => {
      const list = d[section];
      const idx = list.findIndex((c) => c.cardId === card.id);
      const next: DeckCard[] =
        idx >= 0
          ? list.map((c, i) => (i === idx ? { ...c, count: c.count + 1 } : c))
          : [...list, { cardId: card.id, count: 1, snapshot: snapshotOf(card) }];
      return { ...d, [section]: next };
    });
  }

  removeCard(id: string, section: DeckSectionId, cardId: number): void {
    this.mutateOwned(id, (d) => {
      const list = d[section];
      const idx = list.findIndex((c) => c.cardId === cardId);
      if (idx < 0) return d;
      const cur = list[idx];
      const next =
        cur.count > 1
          ? list.map((c, i) => (i === idx ? { ...c, count: c.count - 1 } : c))
          : list.filter((_, i) => i !== idx);
      return { ...d, [section]: next };
    });
  }

  replaceContents(id: string, content: DeckContent): void {
    this.mutateOwned(id, (d) => ({
      ...d,
      name: content.name.trim() || d.name,
      main: content.main,
      extra: content.extra,
      side: content.side,
    }));
  }

  duplicate(id: string): Deck | null {
    const uid = this._auth.currentUserId();
    if (!uid) return null;
    const src = this._decks().find((d) => d.id === id && d.ownerId === uid);
    if (!src) return null;
    const now = Date.now();
    const copy: Deck = {
      id: crypto.randomUUID(),
      ownerId: uid,
      name: `${src.name} (copie)`,
      main: src.main.map((c) => ({ ...c, snapshot: { ...c.snapshot } })),
      extra: src.extra.map((c) => ({ ...c, snapshot: { ...c.snapshot } })),
      side: src.side.map((c) => ({ ...c, snapshot: { ...c.snapshot } })),
      createdAt: now,
      updatedAt: now,
    };
    this._decks.update((arr) => [...arr, copy]);
    this.write();
    return copy;
  }

  private mutateOwned(id: string, fn: (d: Deck) => Deck): void {
    const uid = this._auth.currentUserId();
    if (!uid) return;
    let changed = false;
    this._decks.update((arr) =>
      arr.map((d) => {
        if (d.id === id && d.ownerId === uid) {
          changed = true;
          return { ...fn(d), updatedAt: Date.now() };
        }
        return d;
      }),
    );
    if (changed) this.write();
  }

  private readAndCleanup(): Deck[] {
    const raw = this.readRaw();
    const cleaned = raw.filter((d) => typeof d.ownerId === 'string' && d.ownerId.length > 0);
    if (cleaned.length !== raw.length) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned)); } catch { /* ignore */ }
    }
    return cleaned;
  }

  private readRaw(): Deck[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._decks())); } catch { /* ignore */ }
  }
}
