import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth-service';
import { DeckStore } from './deck-store';
import { DraftService } from './draft-service';

const monster = (id: number, frameType = 'effect') => ({
  id, name: `m${id}`, frameType, type: 'Effect Monster',
  race: 'Spellcaster', card_images: [{ image_url_small: 's.png' }],
}) as any;

async function setup(username = 'Yugi') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [AuthService, DeckStore, DraftService] });
  const auth = TestBed.inject(AuthService);
  await auth.register({ username, email: `${username}@a.com`, password: 'pw123456' });
  const store = TestBed.inject(DeckStore);
  const draft = TestBed.inject(DraftService);
  return { auth, store, draft };
}

describe('DraftService', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty', async () => {
    const { draft } = await setup();
    expect(draft.draft()).toEqual({ name: '', main: [], extra: [], side: [] });
    expect(draft.isDirty()).toBe(false);
  });

  it('addCard appends to the section', async () => {
    const { draft } = await setup();
    draft.addCard('main', monster(1));
    draft.addCard('main', monster(1));
    expect(draft.draft().main).toEqual([
      expect.objectContaining({ cardId: 1, count: 2 }),
    ]);
    expect(draft.isDirty()).toBe(true);
  });

  it('removeCard decrements, deletes at 0', async () => {
    const { draft } = await setup();
    draft.addCard('main', monster(1));
    draft.addCard('main', monster(1));
    draft.removeCard('main', 1);
    expect(draft.draft().main[0].count).toBe(1);
    draft.removeCard('main', 1);
    expect(draft.draft().main).toEqual([]);
  });

  it('setName updates the name', async () => {
    const { draft } = await setup();
    draft.setName('Blue-Eyes');
    expect(draft.draft().name).toBe('Blue-Eyes');
  });

  it('load() copies a saved deck and sets linkedDeckId', async () => {
    const { draft, store } = await setup();
    const saved = store.create('Stored')!;
    store.addCard(saved.id, 'main', monster(1));
    draft.load(store.get(saved.id)!);
    expect(draft.draft().linkedDeckId).toBe(saved.id);
    expect(draft.draft().name).toBe('Stored');
    expect(draft.draft().main).toHaveLength(1);
  });

  it('reset() clears everything', async () => {
    const { draft } = await setup();
    draft.setName('X');
    draft.addCard('main', monster(1));
    draft.reset();
    expect(draft.draft()).toEqual({ name: '', main: [], extra: [], side: [] });
  });

  describe('save', () => {
    it('refuses without a session', () => {
      TestBed.configureTestingModule({ providers: [AuthService, DeckStore, DraftService] });
      const draft = TestBed.inject(DraftService);
      expect(draft.save()).toEqual({ ok: false, reason: 'no-session' });
    });

    it('refuses without a name', async () => {
      const { draft } = await setup();
      expect(draft.save()).toEqual({ ok: false, reason: 'no-name' });
    });

    it('refuses an invalid deck (main > 60)', async () => {
      const { draft } = await setup();
      draft.setName('Big');
      for (let i = 0; i < 61; i++) draft.addCard('main', monster(i));
      expect(draft.save()).toEqual({ ok: false, reason: 'invalid' });
    });

    it('creates a new deck when no linkedDeckId', async () => {
      const { draft, store } = await setup();
      draft.setName('Newone');
      draft.addCard('main', monster(1));
      const r = draft.save();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(store.myDecks()).toHaveLength(1);
      expect(store.get(r.id)?.name).toBe('Newone');
      expect(draft.draft().linkedDeckId).toBe(r.id);
    });

    it('updates an existing deck when linkedDeckId is set', async () => {
      const { draft, store } = await setup();
      const saved = store.create('Original')!;
      draft.load(saved);
      draft.setName('Updated');
      draft.addCard('main', monster(1));
      const r = draft.save();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.id).toBe(saved.id);
      expect(store.get(saved.id)?.name).toBe('Updated');
      expect(store.myDecks()).toHaveLength(1);
    });
  });

  describe('persistence per user', () => {
    it('persists the draft and reloads it for the same user', async () => {
      const { draft } = await setup('Yugi');
      draft.setName('Mine');
      draft.addCard('main', monster(1));
      // simulate a fresh inject for the same logged-in user
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [AuthService, DeckStore, DraftService] });
      const draft2 = TestBed.inject(DraftService);
      expect(draft2.draft().name).toBe('Mine');
      expect(draft2.draft().main).toHaveLength(1);
    });

    it('each user has their own draft slot', async () => {
      const a = await setup('Yugi');
      a.draft.setName('Yugi-draft');
      a.draft.addCard('main', monster(1));
      a.auth.logout();
      const b = await setup('Kaiba');
      expect(b.draft.draft()).toEqual({ name: '', main: [], extra: [], side: [] });
    });
  });
});
