import { Injectable, Optional, computed, effect, inject, signal, Signal } from '@angular/core';
import { Daum } from '../models/yu-gi-result';
import { Deck, DeckCard, DeckSectionId } from '../models/deck';
import { snapshotOf } from '../utils/deck-rules';
import { validateDeck, BanlistLike } from '../utils/deck-validation';
import { AuthService } from './auth-service';
import { BanlistService } from './banlist-service';
import { DeckStore } from './deck-store';

export interface Draft {
  name: string;
  main: DeckCard[];
  extra: DeckCard[];
  side: DeckCard[];
  linkedDeckId?: string;
}

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'no-session' | 'no-name' | 'invalid' };

const EMPTY_DRAFT: Draft = { name: '', main: [], extra: [], side: [] };

/** Fallback banlist used in tests where BanlistService / HttpClient is not provided. */
const NULL_BANLIST: BanlistLike = {
  get: () => undefined,
  maxCopies: () => 3,
};

function draftKey(userId: string): string {
  return `yugioh.draft.${userId}.v1`;
}

@Injectable({ providedIn: 'root' })
export class DraftService {
  private readonly _auth = inject(AuthService);
  private readonly _store = inject(DeckStore);
  private readonly _banlist: BanlistLike;

  private readonly _draft = signal<Draft>(this.readFor(this._auth.currentUserId()));

  readonly draft: Signal<Draft> = this._draft.asReadonly();
  readonly isDirty: Signal<boolean> = computed(() => {
    const d = this._draft();
    return d.name.length > 0 || d.main.length > 0 || d.extra.length > 0 || d.side.length > 0;
  });

  constructor(@Optional() banlist: BanlistService) {
    this._banlist = banlist ?? NULL_BANLIST;

    let prev = this._auth.currentUserId();
    effect(() => {
      const uid = this._auth.currentUserId();
      if (uid !== prev) {
        prev = uid;
        this._draft.set(this.readFor(uid));
      }
    });
  }

  setName(name: string): void {
    this._draft.update((d) => ({ ...d, name }));
    this._persist();
  }

  addCard(section: DeckSectionId, card: Daum): void {
    this._draft.update((d) => {
      const list = d[section];
      const idx = list.findIndex((c) => c.cardId === card.id);
      const next: DeckCard[] =
        idx >= 0
          ? list.map((c, i) => (i === idx ? { ...c, count: c.count + 1 } : c))
          : [...list, { cardId: card.id, count: 1, snapshot: snapshotOf(card) }];
      return { ...d, [section]: next };
    });
    this._persist();
  }

  removeCard(section: DeckSectionId, cardId: number): void {
    this._draft.update((d) => {
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
    this._persist();
  }

  load(deck: Deck): void {
    this._draft.set({
      name: deck.name,
      main: deck.main.map((c) => ({ ...c })),
      extra: deck.extra.map((c) => ({ ...c })),
      side: deck.side.map((c) => ({ ...c })),
      linkedDeckId: deck.id,
    });
    this._persist();
  }

  reset(): void {
    this._draft.set({ ...EMPTY_DRAFT });
    this._persist();
  }

  save(): SaveResult {
    if (!this._auth.currentUserId()) return { ok: false, reason: 'no-session' };
    const d = this._draft();
    if (!d.name.trim()) return { ok: false, reason: 'no-name' };

    const pseudoDeck: Deck = {
      id: d.linkedDeckId ?? 'pending',
      ownerId: this._auth.currentUserId()!,
      name: d.name,
      main: d.main, extra: d.extra, side: d.side,
      createdAt: 0, updatedAt: 0,
    };
    const issues = validateDeck(pseudoDeck, this._banlist);
    if (issues.some((i) => i.severity === 'error')) {
      return { ok: false, reason: 'invalid' };
    }

    if (d.linkedDeckId) {
      this._store.replaceContents(d.linkedDeckId, {
        name: d.name, main: d.main, extra: d.extra, side: d.side,
      });
      return { ok: true, id: d.linkedDeckId };
    }

    const deck = this._store.create(d.name);
    if (!deck) return { ok: false, reason: 'no-session' };
    this._store.replaceContents(deck.id, {
      name: d.name, main: d.main, extra: d.extra, side: d.side,
    });
    this._draft.update((curr) => ({ ...curr, linkedDeckId: deck.id }));
    this._persist();
    return { ok: true, id: deck.id };
  }

  private _persist(): void {
    const uid = this._auth.currentUserId();
    if (uid) this.writeFor(uid, this._draft());
  }

  private readFor(userId: string | null): Draft {
    if (!userId) return { ...EMPTY_DRAFT };
    try {
      const raw = localStorage.getItem(draftKey(userId));
      if (!raw) return { ...EMPTY_DRAFT };
      const parsed = JSON.parse(raw);
      if (
        parsed && typeof parsed.name === 'string'
        && Array.isArray(parsed.main) && Array.isArray(parsed.extra) && Array.isArray(parsed.side)
      ) {
        return parsed as Draft;
      }
      return { ...EMPTY_DRAFT };
    } catch {
      return { ...EMPTY_DRAFT };
    }
  }

  private writeFor(userId: string, draft: Draft): void {
    try { localStorage.setItem(draftKey(userId), JSON.stringify(draft)); } catch { /* ignore */ }
  }
}
