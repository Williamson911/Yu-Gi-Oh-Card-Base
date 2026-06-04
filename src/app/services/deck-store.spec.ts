import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth-service';
import { DeckStore } from './deck-store';

const monster = (id: number, frameType = 'effect') => ({
  id, name: `m${id}`, frameType, type: 'Effect Monster',
  race: 'Spellcaster', card_images: [{ image_url_small: 's.png' }],
}) as any;

async function setupWith(username = 'Yugi'): Promise<{ store: DeckStore; auth: AuthService }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [AuthService, DeckStore] });
  const auth = TestBed.inject(AuthService);
  await auth.register({ username, email: `${username}@a.com`, password: 'pw123456' });
  const store = TestBed.inject(DeckStore);
  return { store, auth };
}

describe('DeckStore (auth-scoped)', () => {
  beforeEach(() => localStorage.clear());

  it('returns no decks when there is no session', () => {
    TestBed.configureTestingModule({ providers: [AuthService, DeckStore] });
    const store = TestBed.inject(DeckStore);
    expect(store.myDecks()).toEqual([]);
    expect(store.create('Try')).toBeNull();
  });

  it('creates a deck owned by the current user', async () => {
    const { store, auth } = await setupWith();
    const deck = store.create('My Deck');
    expect(deck).not.toBeNull();
    expect(deck!.ownerId).toBe(auth.currentUserId());
    expect(store.myDecks()).toHaveLength(1);
  });

  it('only lists my decks via myDecks', async () => {
    const a = await setupWith('Yugi');
    const yugiDeck = a.store.create('Yugi deck');
    a.auth.logout();
    const b = await setupWith('Kaiba');
    expect(b.store.myDecks().map((d) => d.name)).not.toContain('Yugi deck');
    const kaibaDeck = b.store.create('Kaiba deck');
    expect(b.store.myDecks().map((d) => d.name)).toEqual(['Kaiba deck']);
    expect(yugiDeck).toBeTruthy();
    expect(kaibaDeck).toBeTruthy();
  });

  it('get() refuses to return a deck not owned by the current user', async () => {
    const a = await setupWith('Yugi');
    const yugiDeck = a.store.create('Y');
    a.auth.logout();
    const b = await setupWith('Kaiba');
    expect(b.store.get(yugiDeck!.id)).toBeUndefined();
  });

  it('mutations on a non-owned deck are no-ops', async () => {
    const a = await setupWith('Yugi');
    const yugiDeck = a.store.create('Y')!;
    a.auth.logout();
    const b = await setupWith('Kaiba');
    b.store.addCard(yugiDeck.id, 'main', monster(1));
    b.store.rename(yugiDeck.id, 'hijacked');
    b.store.remove(yugiDeck.id);
    // Re-login as Yugi to verify nothing was modified
    b.auth.logout();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [AuthService, DeckStore] });
    const auth = TestBed.inject(AuthService);
    await auth.login({ usernameOrEmail: 'Yugi', password: 'pw123456' });
    const store = TestBed.inject(DeckStore);
    const yugiDeckReread = store.myDecks()[0];
    expect(yugiDeckReread?.name).toBe('Y');
    expect(yugiDeckReread?.main).toEqual([]);
  });

  it('replaceContents writes new sections on an owned deck', async () => {
    const { store } = await setupWith();
    const deck = store.create('X')!;
    store.replaceContents(deck.id, {
      name: 'Renamed',
      main: [{ cardId: 1, count: 2, snapshot: { name: 'm1', image_url_small: '', frameType: 'effect', type: 'Effect Monster', race: 'X' } }],
      extra: [],
      side: [],
    });
    const updated = store.get(deck.id)!;
    expect(updated.name).toBe('Renamed');
    expect(updated.main).toHaveLength(1);
  });

  it('replaceContents is a no-op on a non-owned deck', async () => {
    const a = await setupWith('Yugi');
    const yugiDeck = a.store.create('Y')!;
    a.auth.logout();
    const b = await setupWith('Kaiba');
    b.store.replaceContents(yugiDeck.id, { name: 'X', main: [], extra: [], side: [] });
    b.auth.logout();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [AuthService, DeckStore] });
    const auth = TestBed.inject(AuthService);
    await auth.login({ usernameOrEmail: 'Yugi', password: 'pw123456' });
    const store = TestBed.inject(DeckStore);
    expect(store.get(yugiDeck.id)?.name).toBe('Y');
  });

  it('cleanupOrphanedDecks removes decks with no ownerId on init', () => {
    localStorage.setItem('yugioh.decks.v1', JSON.stringify([
      { id: 'a', name: 'old', main: [], extra: [], side: [], createdAt: 0, updatedAt: 0 },
      { id: 'b', ownerId: 'someone', name: 'owned', main: [], extra: [], side: [], createdAt: 0, updatedAt: 0 },
    ]));
    TestBed.configureTestingModule({ providers: [AuthService, DeckStore] });
    TestBed.inject(DeckStore);
    const stored = JSON.parse(localStorage.getItem('yugioh.decks.v1')!);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('b');
  });
});
