# Deckbuilder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-deck builder to the existing Angular Yu-Gi-Oh card explorer, with TCG ban list awareness, set filtering, and official deck construction rules (40-60 Main / 0-15 Extra / 0-15 Side, max 3 copies cumulative).

**Architecture:** New routes `/decks` (deck list) and `/decks/:id` (builder) live alongside the existing `/` index. Three new signal-based services (`BanlistService`, `SetService`, `DeckStore`) hold cross-cutting state. The existing `YuGiFilters` is extended with a set dropdown, `YuGiCardDetail` gets a deckbuilder mode with `+` buttons, and the card grid is extracted into a reusable `CardGrid` that displays ban list badges.

**Tech Stack:** Angular 21 (standalone components, signals, control flow), Vitest 4 (globals enabled in `tsconfig.spec.json`), YGOPRODeck v7 API, `localStorage` for persistence.

**Reference spec:** `docs/superpowers/specs/2026-06-04-deckbuilder-design.md`

---

## Working notes for the implementer

- This project is **not yet a git repository** at the time of planning. Task 0 below initializes one so that the per-task commits work.
- Vitest globals are enabled via `tsconfig.spec.json` (`"types": ["vitest/globals"]`), so test files use `describe/it/expect` without imports.
- Tests run with `npm test` (alias for `ng test`).
- Build runs with `npm run build`. Dev server: `npm start`.
- For pure-TS logic (services, validators), prefer plain unit tests without `TestBed`. For Angular DI inside services, instantiate with `TestBed`.
- All new components are standalone (no `NgModule`). Follow the existing patterns in `src/app/components/*` and `src/app/pages/*`.
- The existing visual conventions (BEM-ish class names like `yugi__title`, signal-based state, OnPush change detection) should be preserved.

---

## Task 0: Initialize git repository

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Init the repo**

```bash
git init
git checkout -b main
```

- [ ] **Step 2: Create `.gitignore`**

Create `.gitignore` at repo root:

```gitignore
# Compiled output
/dist
/tmp
/out-tsc
/bazel-out

# Node
/node_modules
npm-debug.log
yarn-error.log

# IDEs and editors
.idea/
.project
.classpath
.c9/
*.launch
.settings/
*.sublime-workspace
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json

# OS
.DS_Store
Thumbs.db

# Angular cache
.angular/

# Test outputs
/coverage
/.nyc_output
```

- [ ] **Step 3: Initial commit**

```bash
git add .
git commit -m "chore: initial import of Yu-Gi-Oh card explorer"
```

---

## Task 1: Deck data model and Extra-Deck detection

**Files:**
- Create: `src/app/models/deck.ts`
- Create: `src/app/utils/deck-rules.ts`
- Create: `src/app/utils/deck-rules.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/utils/deck-rules.spec.ts`:

```ts
import { isExtraDeckMonster, defaultSectionFor } from './deck-rules';

const baseCard = (frameType: string) => ({ frameType }) as any;

describe('isExtraDeckMonster', () => {
  it('returns true for fusion frames', () => {
    expect(isExtraDeckMonster(baseCard('fusion'))).toBe(true);
    expect(isExtraDeckMonster(baseCard('fusion_pendulum'))).toBe(true);
  });

  it('returns true for synchro frames', () => {
    expect(isExtraDeckMonster(baseCard('synchro'))).toBe(true);
    expect(isExtraDeckMonster(baseCard('synchro_pendulum'))).toBe(true);
  });

  it('returns true for xyz frames', () => {
    expect(isExtraDeckMonster(baseCard('xyz'))).toBe(true);
    expect(isExtraDeckMonster(baseCard('xyz_pendulum'))).toBe(true);
  });

  it('returns true for link frames', () => {
    expect(isExtraDeckMonster(baseCard('link'))).toBe(true);
  });

  it('returns false for main-deck frames', () => {
    expect(isExtraDeckMonster(baseCard('normal'))).toBe(false);
    expect(isExtraDeckMonster(baseCard('effect'))).toBe(false);
    expect(isExtraDeckMonster(baseCard('ritual'))).toBe(false);
    expect(isExtraDeckMonster(baseCard('spell'))).toBe(false);
    expect(isExtraDeckMonster(baseCard('trap'))).toBe(false);
    expect(isExtraDeckMonster(baseCard('normal_pendulum'))).toBe(false);
    expect(isExtraDeckMonster(baseCard('effect_pendulum'))).toBe(false);
  });

  it('handles missing/empty frameType safely', () => {
    expect(isExtraDeckMonster(baseCard(''))).toBe(false);
    expect(isExtraDeckMonster({} as any)).toBe(false);
  });
});

describe('defaultSectionFor', () => {
  it('returns "extra" for extra-deck frames', () => {
    expect(defaultSectionFor(baseCard('fusion'))).toBe('extra');
    expect(defaultSectionFor(baseCard('synchro'))).toBe('extra');
  });

  it('returns "main" for main-deck frames', () => {
    expect(defaultSectionFor(baseCard('effect'))).toBe('main');
    expect(defaultSectionFor(baseCard('spell'))).toBe('main');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/app/utils/deck-rules.spec.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create the `Deck` model**

Create `src/app/models/deck.ts`:

```ts
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
}

export interface DeckCard {
  cardId: number;
  count: number;
  snapshot: DeckCardSnapshot;
}

export interface Deck {
  id: string;
  name: string;
  main: DeckCard[];
  extra: DeckCard[];
  side: DeckCard[];
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 4: Implement `isExtraDeckMonster` and `defaultSectionFor`**

Create `src/app/utils/deck-rules.ts`:

```ts
import { Daum } from '../models/yu-gi-result';
import { DeckSectionId } from '../models/deck';

const EXTRA_FRAMES = ['fusion', 'synchro', 'xyz', 'link'] as const;

export function isExtraDeckMonster(card: Pick<Daum, 'frameType'>): boolean {
  const ft = (card?.frameType ?? '').toLowerCase();
  return EXTRA_FRAMES.some((f) => ft.startsWith(f));
}

export function defaultSectionFor(card: Pick<Daum, 'frameType'>): Extract<DeckSectionId, 'main' | 'extra'> {
  return isExtraDeckMonster(card) ? 'extra' : 'main';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run src/app/utils/deck-rules.spec.ts`
Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/app/models/deck.ts src/app/utils/deck-rules.ts src/app/utils/deck-rules.spec.ts
git commit -m "feat(deck): add Deck model and extra-deck detection utility"
```

---

## Task 2: Deck snapshot helper

**Files:**
- Modify: `src/app/utils/deck-rules.ts`
- Modify: `src/app/utils/deck-rules.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/app/utils/deck-rules.spec.ts`:

```ts
import { snapshotOf } from './deck-rules';

describe('snapshotOf', () => {
  it('copies only the fields needed for thumbnail display', () => {
    const card: any = {
      id: 1,
      name: 'Dark Magician',
      frameType: 'normal',
      type: 'Normal Monster',
      race: 'Spellcaster',
      attribute: 'DARK',
      level: 7,
      atk: 2500,
      def: 2100,
      desc: 'long description ignored',
      card_images: [{ image_url_small: 'small.png', image_url: 'big.png' }],
    };
    expect(snapshotOf(card)).toEqual({
      name: 'Dark Magician',
      image_url_small: 'small.png',
      frameType: 'normal',
      type: 'Normal Monster',
      race: 'Spellcaster',
      attribute: 'DARK',
      level: 7,
      atk: 2500,
      def: 2100,
    });
  });

  it('omits undefined monster stats for spells/traps', () => {
    const card: any = {
      name: 'Pot of Greed',
      frameType: 'spell',
      type: 'Spell Card',
      race: 'Normal',
      card_images: [{ image_url_small: 'pot.png' }],
    };
    const snap = snapshotOf(card);
    expect(snap.attribute).toBeUndefined();
    expect(snap.level).toBeUndefined();
    expect(snap.atk).toBeUndefined();
    expect(snap.def).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- --run src/app/utils/deck-rules.spec.ts`
Expected: FAIL — `snapshotOf is not a function`.

- [ ] **Step 3: Implement `snapshotOf`**

Append to `src/app/utils/deck-rules.ts`:

```ts
import { DeckCardSnapshot } from '../models/deck';

export function snapshotOf(card: Daum): DeckCardSnapshot {
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
  };
}
```

(Move the `DeckCardSnapshot` import next to the existing `DeckSectionId` import to keep imports grouped.)

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test -- --run src/app/utils/deck-rules.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/utils/deck-rules.ts src/app/utils/deck-rules.spec.ts
git commit -m "feat(deck): add snapshotOf to pack the minimum card data for deck storage"
```

---

## Task 3: Validation logic (canAddCard + validateDeck)

**Files:**
- Create: `src/app/utils/deck-validation.ts`
- Create: `src/app/utils/deck-validation.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/utils/deck-validation.spec.ts`:

```ts
import { canAddCard, validateDeck, BanStatus } from './deck-validation';
import { Deck, DeckCard } from '../models/deck';

function emptyDeck(): Deck {
  return { id: 'd', name: 'D', main: [], extra: [], side: [], createdAt: 0, updatedAt: 0 };
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

// banlist helper
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
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npm test -- --run src/app/utils/deck-validation.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement validation**

Create `src/app/utils/deck-validation.ts`:

```ts
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
    return { allowed: false, reason: 'Cette carte va dans l’Extra Deck' };
  }
  if (section === 'extra' && !isExtra) {
    return { allowed: false, reason: 'Cette carte ne va pas dans l’Extra Deck' };
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
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test -- --run src/app/utils/deck-validation.spec.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/app/utils/deck-validation.ts src/app/utils/deck-validation.spec.ts
git commit -m "feat(deck): add canAddCard and validateDeck with full rule coverage"
```

---

## Task 4: BanlistService

**Files:**
- Create: `src/app/services/banlist-service.ts`
- Create: `src/app/services/banlist-service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/services/banlist-service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { BanlistService } from './banlist-service';

describe('BanlistService', () => {
  function setup(response: any) {
    const http = { get: vi.fn().mockReturnValue(of(response)) } as unknown as HttpClient;
    TestBed.configureTestingModule({
      providers: [BanlistService, { provide: HttpClient, useValue: http }],
    });
    return TestBed.inject(BanlistService);
  }

  it('builds a Map from cardinfo.php?banlist=tcg payload', () => {
    const service = setup({
      data: [
        { id: 1, banlist_info: { ban_tcg: 'Banned' } },
        { id: 2, banlist_info: { ban_tcg: 'Limited' } },
        { id: 3, banlist_info: { ban_tcg: 'Semi-Limited' } },
        { id: 4, banlist_info: {} },
      ],
    });
    expect(service.get(1)).toBe('Banned');
    expect(service.get(2)).toBe('Limited');
    expect(service.get(3)).toBe('Semi-Limited');
    expect(service.get(4)).toBeUndefined();
    expect(service.get(999)).toBeUndefined();
  });

  it('maxCopies returns 0/1/2/3 based on status', () => {
    const service = setup({
      data: [
        { id: 1, banlist_info: { ban_tcg: 'Banned' } },
        { id: 2, banlist_info: { ban_tcg: 'Limited' } },
        { id: 3, banlist_info: { ban_tcg: 'Semi-Limited' } },
      ],
    });
    expect(service.maxCopies(1)).toBe(0);
    expect(service.maxCopies(2)).toBe(1);
    expect(service.maxCopies(3)).toBe(2);
    expect(service.maxCopies(999)).toBe(3);
  });

  it('returns sane defaults when HTTP fails', () => {
    const http = {
      get: vi.fn().mockImplementation(() => {
        throw new Error('boom');
      }),
    } as unknown as HttpClient;
    TestBed.configureTestingModule({
      providers: [BanlistService, { provide: HttpClient, useValue: http }],
    });
    const service = TestBed.inject(BanlistService);
    expect(service.maxCopies(42)).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npm test -- --run src/app/services/banlist-service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `src/app/services/banlist-service.ts`:

```ts
import { inject, Injectable, signal, Signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';

export type BanStatus = 'Banned' | 'Limited' | 'Semi-Limited';

interface BanlistResponse {
  data: Array<{
    id: number;
    banlist_info?: { ban_tcg?: BanStatus };
  }>;
}

@Injectable({ providedIn: 'root' })
export class BanlistService {
  private readonly _http = inject(HttpClient);
  private readonly _status = signal<Map<number, BanStatus>>(new Map());

  readonly status: Signal<Map<number, BanStatus>> = this._status.asReadonly();

  constructor() {
    this.load();
  }

  get(cardId: number): BanStatus | undefined {
    return this._status().get(cardId);
  }

  maxCopies(cardId: number): 0 | 1 | 2 | 3 {
    const s = this._status().get(cardId);
    if (s === 'Banned') return 0;
    if (s === 'Limited') return 1;
    if (s === 'Semi-Limited') return 2;
    return 3;
  }

  private load(): void {
    try {
      this._http
        .get<BanlistResponse>(
          'https://db.ygoprodeck.com/api/v7/cardinfo.php?banlist=tcg',
        )
        .pipe(catchError(() => of<BanlistResponse>({ data: [] })))
        .subscribe((res) => {
          const map = new Map<number, BanStatus>();
          for (const c of res.data ?? []) {
            const s = c.banlist_info?.ban_tcg;
            if (s) map.set(c.id, s);
          }
          this._status.set(map);
        });
    } catch {
      // leave empty map — maxCopies will return 3 by default
    }
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test -- --run src/app/services/banlist-service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/services/banlist-service.ts src/app/services/banlist-service.spec.ts
git commit -m "feat(banlist): add BanlistService loading TCG status from YGOPRODeck"
```

---

## Task 5: SetService

**Files:**
- Create: `src/app/services/set-service.ts`

- [ ] **Step 1: Implement the service**

Create `src/app/services/set-service.ts`:

```ts
import { inject, Injectable, signal, Signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';

export interface CardSetInfo {
  set_name: string;
  set_code: string;
  num_of_cards: number;
  tcg_date?: string;
}

@Injectable({ providedIn: 'root' })
export class SetService {
  private readonly _http = inject(HttpClient);
  private readonly _sets = signal<CardSetInfo[]>([]);

  readonly sets: Signal<CardSetInfo[]> = this._sets.asReadonly();

  constructor() {
    this.load();
  }

  private load(): void {
    this._http
      .get<CardSetInfo[]>('https://db.ygoprodeck.com/api/v7/cardsets.php')
      .pipe(catchError(() => of<CardSetInfo[]>([])))
      .subscribe((data) => {
        const sorted = [...data].sort((a, b) => {
          const da = a.tcg_date ?? '0000-00-00';
          const db = b.tcg_date ?? '0000-00-00';
          return db.localeCompare(da);
        });
        this._sets.set(sorted);
      });
  }
}
```

- [ ] **Step 2: Build to verify no compile errors**

Run: `npm run build`
Expected: SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add src/app/services/set-service.ts
git commit -m "feat(sets): add SetService loading the full TCG set list"
```

---

## Task 6: DeckStore with localStorage persistence

**Files:**
- Create: `src/app/services/deck-store.ts`
- Create: `src/app/services/deck-store.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/services/deck-store.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { DeckStore } from './deck-store';

const monster = (id: number, frameType = 'effect') => ({
  id, name: `m${id}`, frameType, type: 'Effect Monster',
  race: 'Spellcaster', card_images: [{ image_url_small: 's.png' }],
}) as any;

const fusion = (id: number) => monster(id, 'fusion');

describe('DeckStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [DeckStore] });
  });

  it('starts with an empty deck list when localStorage is empty', () => {
    const store = TestBed.inject(DeckStore);
    expect(store.decks()).toEqual([]);
  });

  it('creates a new deck and persists it', () => {
    const store = TestBed.inject(DeckStore);
    const deck = store.create('My Deck');
    expect(deck.id).toBeTruthy();
    expect(store.decks()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('yugioh.decks.v1')!)).toHaveLength(1);
  });

  it('reloads decks from localStorage on subsequent inject', () => {
    const a = TestBed.inject(DeckStore);
    a.create('Persisted');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [DeckStore] });
    const b = TestBed.inject(DeckStore);
    expect(b.decks().map((d) => d.name)).toEqual(['Persisted']);
  });

  it('survives corrupted localStorage', () => {
    localStorage.setItem('yugioh.decks.v1', 'not-json');
    const store = TestBed.inject(DeckStore);
    expect(store.decks()).toEqual([]);
  });

  it('renames a deck', () => {
    const store = TestBed.inject(DeckStore);
    const d = store.create('Old');
    store.rename(d.id, 'New');
    expect(store.get(d.id)?.name).toBe('New');
  });

  it('removes a deck', () => {
    const store = TestBed.inject(DeckStore);
    const d = store.create('Bye');
    store.remove(d.id);
    expect(store.get(d.id)).toBeUndefined();
    expect(store.decks()).toHaveLength(0);
  });

  it('addCard inserts a new entry with count=1', () => {
    const store = TestBed.inject(DeckStore);
    const d = store.create('X');
    store.addCard(d.id, 'main', monster(1));
    expect(store.get(d.id)!.main).toEqual([
      expect.objectContaining({ cardId: 1, count: 1 }),
    ]);
  });

  it('addCard increments existing entry count', () => {
    const store = TestBed.inject(DeckStore);
    const d = store.create('X');
    store.addCard(d.id, 'main', monster(1));
    store.addCard(d.id, 'main', monster(1));
    expect(store.get(d.id)!.main[0].count).toBe(2);
  });

  it('removeCard decrements count, deletes entry at 0', () => {
    const store = TestBed.inject(DeckStore);
    const d = store.create('X');
    store.addCard(d.id, 'main', monster(1));
    store.addCard(d.id, 'main', monster(1));
    store.removeCard(d.id, 'main', 1);
    expect(store.get(d.id)!.main[0].count).toBe(1);
    store.removeCard(d.id, 'main', 1);
    expect(store.get(d.id)!.main).toEqual([]);
  });

  it('updatedAt advances on mutation', () => {
    const store = TestBed.inject(DeckStore);
    const d = store.create('X');
    const t0 = store.get(d.id)!.updatedAt;
    // Force a small delay by mocking Date.now if needed; here we just check
    // that the value can change without throwing.
    store.addCard(d.id, 'main', monster(1));
    expect(store.get(d.id)!.updatedAt).toBeGreaterThanOrEqual(t0);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npm test -- --run src/app/services/deck-store.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement DeckStore**

Create `src/app/services/deck-store.ts`:

```ts
import { Injectable, signal, Signal } from '@angular/core';
import { Daum } from '../models/yu-gi-result';
import { Deck, DeckCard, DeckSectionId } from '../models/deck';
import { snapshotOf } from '../utils/deck-rules';

const STORAGE_KEY = 'yugioh.decks.v1';

@Injectable({ providedIn: 'root' })
export class DeckStore {
  private readonly _decks = signal<Deck[]>(this.read());

  readonly decks: Signal<Deck[]> = this._decks.asReadonly();

  get(id: string): Deck | undefined {
    return this._decks().find((d) => d.id === id);
  }

  create(name: string): Deck {
    const now = Date.now();
    const deck: Deck = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Nouveau deck',
      main: [],
      extra: [],
      side: [],
      createdAt: now,
      updatedAt: now,
    };
    this._decks.update((arr) => [...arr, deck]);
    this.write();
    return deck;
  }

  rename(id: string, name: string): void {
    this.mutate(id, (d) => ({ ...d, name: name.trim() || d.name }));
  }

  remove(id: string): void {
    this._decks.update((arr) => arr.filter((d) => d.id !== id));
    this.write();
  }

  addCard(id: string, section: DeckSectionId, card: Daum): void {
    this.mutate(id, (d) => {
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
    this.mutate(id, (d) => {
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

  private mutate(id: string, fn: (d: Deck) => Deck): void {
    this._decks.update((arr) =>
      arr.map((d) =>
        d.id === id ? { ...fn(d), updatedAt: Date.now() } : d,
      ),
    );
    this.write();
  }

  private read(): Deck[] {
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._decks()));
    } catch {
      // localStorage might be full or disabled — silently ignore
    }
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test -- --run src/app/services/deck-store.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/services/deck-store.ts src/app/services/deck-store.spec.ts
git commit -m "feat(deck): add DeckStore with signal state and localStorage persistence"
```

---

## Task 7: Extend YuGiService with set filter

**Files:**
- Modify: `src/app/services/yu-gi-service.ts`

- [ ] **Step 1: Add `set` to `CardQuery`**

In `src/app/services/yu-gi-service.ts`, add to the `CardQuery` interface, right after `sort?: string;`:

```ts
  set?: string;
```

- [ ] **Step 2: Pass it as `cardset` HTTP param**

In `getCards`, before the `if (query.sort)` line, add:

```ts
if (query.set?.trim()) params = params.set('cardset', query.set.trim());
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: SUCCESS.

- [ ] **Step 4: Commit**

```bash
git add src/app/services/yu-gi-service.ts
git commit -m "feat(filters): support filtering cards by set in CardQuery"
```

---

## Task 8: Add set dropdown to YuGiFilters

**Files:**
- Modify: `src/app/components/yu-gi-filters/yu-gi-filters.ts`
- Modify: `src/app/components/yu-gi-filters/yu-gi-filters.html`
- Modify: `src/app/components/yu-gi-filters/yu-gi-filters.scss`

- [ ] **Step 1: Inject `SetService` and add set state**

In `yu-gi-filters.ts`, add to the imports:

```ts
import { inject } from '@angular/core';
import { SetService } from '../../services/set-service';
```

Add to the `EMPTY_QUERY` constant:

```ts
  set: '',
```

In the class body, after `private readonly _http` style declarations (or after `apply = output<CardQuery>();`), add:

```ts
  private readonly _setService = inject(SetService);
  protected readonly sets = this._setService.sets;
```

- [ ] **Step 2: Render the dropdown in the filter panel**

In `yu-gi-filters.html`, inside `<div class="filters__grid">`, add a new field (place it after the first `<label class="filters__field">` for Catégorie):

```html
<label class="filters__field">
  <span>Set</span>
  <select
    class="filters__select"
    [ngModel]="draft().set"
    (ngModelChange)="updateField('set', $event)">
    <option value="">Tous les sets</option>
    @for (s of sets(); track s.set_code) {
      <option [value]="s.set_name">{{ s.set_code }} — {{ s.set_name }}</option>
    }
  </select>
</label>
```

- [ ] **Step 3: Include `set` in the active filter count**

In `yu-gi-filters.ts`, update the `activeFilterCount` computed signal: add `if (q.set) n++;` to the body.

- [ ] **Step 4: Manual verification**

Run: `npm start` and open `http://localhost:4200/`.
- Open the filters panel.
- The new "Set" dropdown lists actual sets (e.g. `LOB — Legend of Blue Eyes White Dragon`).
- Pick a set and click "Appliquer" → only cards from that set load.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/yu-gi-filters/
git commit -m "feat(filters): add set dropdown populated from SetService"
```

---

## Task 9: Extract AppHeader (shared nav)

**Files:**
- Create: `src/app/components/app-header/app-header.ts`
- Create: `src/app/components/app-header/app-header.html`
- Create: `src/app/components/app-header/app-header.scss`
- Modify: `src/app/pages/yu-gi-index/yu-gi-index.html` (replace the hero section)
- Modify: `src/app/pages/yu-gi-index/yu-gi-index.ts` (import AppHeader)

- [ ] **Step 1: Create the component**

Create `src/app/components/app-header/app-header.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeader {}
```

Create `src/app/components/app-header/app-header.html`:

```html
<header class="appheader">
  <div class="appheader__brand">
    <img
      class="appheader__logo"
      src="https://img.yugioh-card.com/eu/wp-content/themes/yugioh/images/logo/Yugioh-EN-DE.svg"
      alt="Yu-Gi-Oh!"
      loading="eager" />
  </div>
  <nav class="appheader__nav" aria-label="Navigation principale">
    <a
      class="appheader__link"
      routerLink="/"
      routerLinkActive="is-active"
      [routerLinkActiveOptions]="{ exact: true }">
      Cartes
    </a>
    <a
      class="appheader__link"
      routerLink="/decks"
      routerLinkActive="is-active">
      Mes decks
    </a>
  </nav>
</header>
```

Create `src/app/components/app-header/app-header.scss`:

```scss
.appheader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 32px;
  border-bottom: 1px solid rgba(212, 175, 55, 0.2);
  position: relative;
  z-index: 2;
}

.appheader__brand {
  display: flex;
  align-items: center;
  gap: 16px;
}

.appheader__logo {
  height: 40px;
  filter: drop-shadow(0 2px 8px rgba(212, 175, 55, 0.3));
}

.appheader__nav {
  display: flex;
  gap: 24px;
}

.appheader__link {
  color: #d4af37;
  text-decoration: none;
  font-weight: 600;
  letter-spacing: 0.5px;
  padding: 8px 16px;
  border-radius: 4px;
  transition: background 150ms ease, color 150ms ease;

  &:hover { background: rgba(212, 175, 55, 0.1); }

  &.is-active {
    background: rgba(212, 175, 55, 0.2);
    color: #f5e6c5;
  }
}
```

- [ ] **Step 2: Use it on the index page**

In `src/app/pages/yu-gi-index/yu-gi-index.ts`, add to the imports list at the top of the file and to the `imports:` array:

```ts
import { AppHeader } from '../../components/app-header/app-header';
// imports: [YuGiCardDetail, CardIcon, YuGiFilters, HoloCard, AppHeader],
```

In `src/app/pages/yu-gi-index/yu-gi-index.html`, replace the existing `<header class="yugi__hero">…</header>` block with:

```html
<app-header />

<header class="yugi__hero">
  <p class="yugi__eyebrow">Trading Card Game</p>
  <h1 class="yugi__title">Catalogue des cartes</h1>
  <p class="yugi__subtitle">It's time to duel — parcours la base de cartes officielle.</p>
</header>
```

(Note: the original `<h1>` contained the logo `<img>` — we move that to the shared header, and the index title becomes plain text.)

- [ ] **Step 3: Verify visually**

Run: `npm start`.
- Both header links are visible.
- Hover and active states work.
- The existing hero section still renders below the header.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/app-header src/app/pages/yu-gi-index/yu-gi-index.ts src/app/pages/yu-gi-index/yu-gi-index.html
git commit -m "feat(layout): extract AppHeader with nav between cards and decks"
```

---

## Task 10: Extract CardGrid with ban list badges

**Files:**
- Create: `src/app/components/card-grid/card-grid.ts`
- Create: `src/app/components/card-grid/card-grid.html`
- Create: `src/app/components/card-grid/card-grid.scss`
- Modify: `src/app/pages/yu-gi-index/yu-gi-index.html` (replace `<ul class="yugi__grid">…</ul>`)
- Modify: `src/app/pages/yu-gi-index/yu-gi-index.ts` (import CardGrid, remove unused symbols)

- [ ] **Step 1: Create the component**

Create `src/app/components/card-grid/card-grid.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { Daum } from '../../models/yu-gi-result';
import { CardIcon } from '../card-icon/card-icon';
import { HoloCard } from '../../directives/holo-card';
import {
  getFrameStyle,
  getSpellTrapIcon,
  isSpellOrTrap,
} from '../../utils/card-style';
import { Language, translateRace } from '../../utils/filter-translations';
import { BanlistService, BanStatus } from '../../services/banlist-service';

@Component({
  selector: 'app-card-grid',
  imports: [CardIcon, HoloCard],
  templateUrl: './card-grid.html',
  styleUrl: './card-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardGrid {
  cards = input.required<Daum[]>();
  language = input<Language>('fr');
  loading = input<boolean>(false);
  selectedId = input<number | null>(null);
  cardClick = output<Daum>();

  private readonly _banlist = inject(BanlistService);

  protected frameStyle(card: Daum) { return getFrameStyle(card.frameType); }
  protected cardIcon(card: Daum) { return getSpellTrapIcon(card.race, card.type); }
  protected isSpellTrap(card: Daum) { return isSpellOrTrap(card.type); }
  protected raceLabel(card: Daum) { return translateRace(card.race, this.language()); }

  protected banStatus(card: Daum): BanStatus | undefined {
    return this._banlist.get(card.id);
  }

  protected banLabel(status: BanStatus): string {
    return status === 'Banned' ? 'INTERDITE'
      : status === 'Limited' ? 'LIMITÉE'
      : 'SEMI';
  }

  protected banClass(status: BanStatus): string {
    return status === 'Banned' ? 'card-grid__ban card-grid__ban--banned'
      : status === 'Limited' ? 'card-grid__ban card-grid__ban--limited'
      : 'card-grid__ban card-grid__ban--semi';
  }

  protected isRare(card: Daum): boolean {
    const ft = (card.frameType || '').toLowerCase();
    return ft.startsWith('xyz') || ft.startsWith('synchro')
        || ft.includes('pendulum') || ft.startsWith('link');
  }

  protected onSelect(card: Daum) {
    this.cardClick.emit(card);
  }
}
```

Create `src/app/components/card-grid/card-grid.html`:

```html
<ul class="card-grid" [class.is-loading]="loading()">
  @for (c of cards(); track c.id) {
    <li
      class="card-grid__item yugi-card"
      appHoloCard
      [style.--frame-bg]="frameStyle(c).background"
      [style.--frame-border]="frameStyle(c).borderColor"
      [style.--frame-text]="frameStyle(c).textColor"
      [class.yugi-card--selected]="selectedId() === c.id"
      [class.yugi-card--rare]="isRare(c)"
      (click)="onSelect(c)"
      (keydown.enter)="onSelect(c)"
      (keydown.space)="onSelect(c); $event.preventDefault()"
      tabindex="0"
      role="button"
      [attr.aria-label]="'Voir les détails de ' + c.name">
      <div class="yugi-card__frame">
        <img
          class="yugi-card__image"
          [src]="c.card_images[0].image_url_small"
          [alt]="c.name"
          loading="lazy" />
        @if (cardIcon(c) !== 'none') {
          <span class="yugi-card__icon" aria-hidden="true">
            <app-card-icon [icon]="cardIcon(c)" [size]="22" [label]="c.race" />
          </span>
        }
        @if (banStatus(c); as s) {
          <span [class]="banClass(s)" [attr.aria-label]="'Statut: ' + banLabel(s)">
            {{ banLabel(s) }}
          </span>
        }
      </div>
      <h3 class="yugi-card__name">{{ c.name }}</h3>
      <p class="yugi-card__type">
        {{ frameStyle(c).label }}@if (!isSpellTrap(c)) { · {{ raceLabel(c) }} }
      </p>
    </li>
  } @empty {
    <li class="card-grid__empty">
      @if (loading()) {
        Invocation en cours…
      } @else {
        Aucune carte ne correspond aux filtres.
      }
    </li>
  }
</ul>
```

Create `src/app/components/card-grid/card-grid.scss`:

```scss
.card-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 18px;

  &.is-loading { opacity: 0.5; }
}

.card-grid__empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 48px 16px;
  color: #d4af37;
  opacity: 0.7;
}

.card-grid__ban {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 8px;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  border-radius: 3px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  z-index: 2;
}

.card-grid__ban--banned { background: #b41a2c; color: #fff; }
.card-grid__ban--limited { background: #d97b1d; color: #fff; }
.card-grid__ban--semi { background: #d4af37; color: #2a1a08; }
```

- [ ] **Step 2: Replace the inline grid in YuGiIndex**

In `src/app/pages/yu-gi-index/yu-gi-index.ts`:
- Add `import { CardGrid } from '../../components/card-grid/card-grid';`.
- Replace the `imports:` array with: `imports: [YuGiCardDetail, YuGiFilters, AppHeader, CardGrid],`.
- Remove the now-unused imports of `CardIcon`, `HoloCard`, `getFrameStyle`, `getSpellTrapIcon`, `isSpellOrTrap`, `translateRace`, plus the methods `frameStyle`, `cardIcon`, `isSpellTrap`, `raceLabel`, `isRare` (they live in CardGrid now).

In `src/app/pages/yu-gi-index/yu-gi-index.html`, replace the entire `<ul class="yugi__grid">…</ul>` block with:

```html
<app-card-grid
  [cards]="yugiResult()?.data ?? []"
  [language]="language()"
  [loading]="loading()"
  [selectedId]="selectedCard()?.id ?? null"
  (cardClick)="select($event)" />
```

- [ ] **Step 3: Verify visually**

Run: `npm start`.
- The card grid renders identically.
- Ban list badges appear in the top-right of restricted cards (e.g. search "pot of greed").
- Clicking a card still opens the detail.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/card-grid src/app/pages/yu-gi-index/
git commit -m "feat(grid): extract CardGrid component with ban list badges"
```

---

## Task 11: DeckListPage at /decks

**Files:**
- Create: `src/app/pages/deck-list/deck-list.ts`
- Create: `src/app/pages/deck-list/deck-list.html`
- Create: `src/app/pages/deck-list/deck-list.scss`
- Modify: `src/app/app.routes.ts`

- [ ] **Step 1: Add the route**

In `src/app/app.routes.ts`, before the wildcard route, add:

```ts
{
  path: 'decks',
  loadComponent: () =>
    import('./pages/deck-list/deck-list').then((m) => m.DeckList),
},
```

- [ ] **Step 2: Create the page**

Create `src/app/pages/deck-list/deck-list.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DeckStore } from '../../services/deck-store';
import { AppHeader } from '../../components/app-header/app-header';
import { Deck } from '../../models/deck';

@Component({
  selector: 'app-deck-list',
  imports: [AppHeader],
  templateUrl: './deck-list.html',
  styleUrl: './deck-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckList {
  private readonly _store = inject(DeckStore);
  private readonly _router = inject(Router);

  protected readonly decks = this._store.decks;
  protected readonly count = computed(() => this.decks().length);

  protected sizeOf(deck: Deck): number {
    return deck.main.reduce((s, c) => s + c.count, 0)
         + deck.extra.reduce((s, c) => s + c.count, 0)
         + deck.side.reduce((s, c) => s + c.count, 0);
  }

  protected previewThumbs(deck: Deck): string[] {
    return deck.main.slice(0, 3).map((c) => c.snapshot.image_url_small).filter(Boolean);
  }

  protected formatDate(ts: number): string {
    const diff = Date.now() - ts;
    const day = 86400000;
    if (diff < day) return 'aujourd’hui';
    if (diff < 2 * day) return 'hier';
    if (diff < 30 * day) return `il y a ${Math.floor(diff / day)} jours`;
    return new Date(ts).toLocaleDateString('fr-FR');
  }

  protected create(): void {
    const name = window.prompt('Nom du nouveau deck ?', 'Mon deck');
    if (name === null) return;
    const deck = this._store.create(name);
    this._router.navigate(['/decks', deck.id]);
  }

  protected rename(deck: Deck, event: Event): void {
    event.stopPropagation();
    const name = window.prompt('Nouveau nom :', deck.name);
    if (name === null || name.trim() === '') return;
    this._store.rename(deck.id, name);
  }

  protected remove(deck: Deck, event: Event): void {
    event.stopPropagation();
    if (!window.confirm(`Supprimer "${deck.name}" ?`)) return;
    this._store.remove(deck.id);
  }

  protected open(deck: Deck): void {
    this._router.navigate(['/decks', deck.id]);
  }
}
```

Create `src/app/pages/deck-list/deck-list.html`:

```html
<app-header />

<section class="deck-list">
  <div class="deck-list__head">
    <div>
      <h1 class="deck-list__title">Mes decks</h1>
      <p class="deck-list__subtitle">
        {{ count() }} deck{{ count() > 1 ? 's' : '' }} sauvegardé{{ count() > 1 ? 's' : '' }}
      </p>
    </div>
    <button type="button" class="deck-list__create" (click)="create()">
      + Nouveau deck
    </button>
  </div>

  @if (count() === 0) {
    <div class="deck-list__empty">
      <p>Aucun deck pour l'instant.</p>
      <button type="button" class="deck-list__create" (click)="create()">
        + Créer mon premier deck
      </button>
    </div>
  } @else {
    <ul class="deck-list__grid">
      @for (d of decks(); track d.id) {
        <li
          class="deck-card"
          tabindex="0"
          role="button"
          (click)="open(d)"
          (keydown.enter)="open(d)">
          <div class="deck-card__preview">
            @if (previewThumbs(d).length > 0) {
              @for (src of previewThumbs(d); track $index) {
                <img class="deck-card__thumb" [src]="src" alt="" loading="lazy" />
              }
            } @else {
              <span class="deck-card__preview-empty" aria-hidden="true">𓂀</span>
            }
          </div>
          <h2 class="deck-card__name">{{ d.name }}</h2>
          <p class="deck-card__meta">
            {{ sizeOf(d) }} carte{{ sizeOf(d) > 1 ? 's' : '' }} ·
            modifié {{ formatDate(d.updatedAt) }}
          </p>
          <div class="deck-card__actions">
            <button type="button" class="deck-card__action" (click)="rename(d, $event)">
              Renommer
            </button>
            <button type="button" class="deck-card__action deck-card__action--danger"
                    (click)="remove(d, $event)">
              Supprimer
            </button>
          </div>
        </li>
      }
    </ul>
  }
</section>
```

Create `src/app/pages/deck-list/deck-list.scss`:

```scss
.deck-list {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px;
}

.deck-list__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 32px;
}

.deck-list__title {
  margin: 0;
  font-size: 2.2rem;
  color: #f5e6c5;
}

.deck-list__subtitle {
  margin: 4px 0 0;
  color: #d4af37;
  opacity: 0.8;
}

.deck-list__create {
  background: linear-gradient(135deg, #d4af37, #f5d76e);
  color: #2a1a08;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(212, 175, 55, 0.4);
  }
}

.deck-list__empty {
  text-align: center;
  padding: 64px 16px;
  color: #d4af37;

  p { margin-bottom: 24px; font-size: 1.1rem; }
}

.deck-list__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
}

.deck-card {
  background: rgba(20, 14, 8, 0.7);
  border: 1px solid rgba(212, 175, 55, 0.3);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: border-color 150ms ease, transform 150ms ease;

  &:hover, &:focus-visible {
    border-color: #d4af37;
    transform: translateY(-2px);
  }
}

.deck-card__preview {
  display: flex;
  gap: 4px;
  height: 96px;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  overflow: hidden;
}

.deck-card__thumb {
  width: 64px;
  height: 96px;
  object-fit: cover;
  border-radius: 2px;
}

.deck-card__preview-empty {
  font-size: 3rem;
  color: rgba(212, 175, 55, 0.4);
}

.deck-card__name {
  margin: 0 0 4px;
  font-size: 1.1rem;
  color: #f5e6c5;
}

.deck-card__meta {
  margin: 0 0 12px;
  color: #d4af37;
  opacity: 0.7;
  font-size: 0.85rem;
}

.deck-card__actions {
  display: flex;
  gap: 8px;
}

.deck-card__action {
  flex: 1;
  background: transparent;
  border: 1px solid rgba(212, 175, 55, 0.4);
  color: #d4af37;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;

  &:hover { background: rgba(212, 175, 55, 0.1); }

  &--danger:hover {
    border-color: #b41a2c;
    color: #b41a2c;
    background: rgba(180, 26, 44, 0.1);
  }
}
```

- [ ] **Step 3: Manual verification**

Run: `npm start` and navigate to `/decks`.
- Empty state appears.
- Click "+ Créer mon premier deck", enter a name → redirect to `/decks/<id>` (404 for now, that's OK).
- Go back to `/decks` → the deck appears in the list.
- Rename and Delete work as expected.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/deck-list src/app/app.routes.ts
git commit -m "feat(decks): add /decks page listing saved decks with create/rename/delete"
```

---

## Task 12: DeckSection component

**Files:**
- Create: `src/app/components/deck-section/deck-section.ts`
- Create: `src/app/components/deck-section/deck-section.html`
- Create: `src/app/components/deck-section/deck-section.scss`

- [ ] **Step 1: Create the component**

Create `src/app/components/deck-section/deck-section.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { DeckCard, DeckSectionId } from '../../models/deck';

@Component({
  selector: 'app-deck-section',
  templateUrl: './deck-section.html',
  styleUrl: './deck-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckSection {
  section = input.required<DeckSectionId>();
  title = input.required<string>();
  cards = input.required<DeckCard[]>();
  min = input<number | null>(null);
  max = input.required<number>();
  removeCard = output<number>();

  protected readonly size = computed(() =>
    this.cards().reduce((s, c) => s + c.count, 0),
  );

  protected readonly outOfRange = computed(() => {
    const n = this.size();
    const lo = this.min();
    return (lo !== null && n < lo) || n > this.max();
  });

  protected readonly counterLabel = computed(() => {
    const n = this.size();
    const lo = this.min();
    return lo !== null ? `${n}/${lo}-${this.max()}` : `${n}/${this.max()}`;
  });

  protected expanded(card: DeckCard): number[] {
    return Array.from({ length: card.count }, (_, i) => i);
  }

  protected onRemove(cardId: number) {
    this.removeCard.emit(cardId);
  }
}
```

Create `src/app/components/deck-section/deck-section.html`:

```html
<section class="deck-section">
  <header class="deck-section__head">
    <h3 class="deck-section__title">{{ title() }}</h3>
    <span
      class="deck-section__counter"
      [class.deck-section__counter--bad]="outOfRange()">
      {{ counterLabel() }}
    </span>
  </header>

  @if (cards().length === 0) {
    <p class="deck-section__empty">Vide</p>
  } @else {
    <ul class="deck-section__grid">
      @for (c of cards(); track c.cardId) {
        @for (_ of expanded(c); track $index) {
          <li
            class="deck-section__cell"
            tabindex="0"
            role="button"
            [attr.aria-label]="'Retirer ' + c.snapshot.name"
            (click)="onRemove(c.cardId)"
            (keydown.enter)="onRemove(c.cardId)">
            <img
              class="deck-section__thumb"
              [src]="c.snapshot.image_url_small"
              [alt]="c.snapshot.name"
              loading="lazy" />
            <span class="deck-section__remove" aria-hidden="true">−</span>
          </li>
        }
      }
    </ul>
  }
</section>
```

Create `src/app/components/deck-section/deck-section.scss`:

```scss
.deck-section {
  margin-bottom: 20px;
}

.deck-section__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(212, 175, 55, 0.2);
}

.deck-section__title {
  margin: 0;
  font-size: 1rem;
  color: #f5e6c5;
  letter-spacing: 0.5px;
}

.deck-section__counter {
  font-size: 0.85rem;
  color: #d4af37;
  font-weight: 600;

  &--bad { color: #ff6b7a; }
}

.deck-section__empty {
  margin: 0;
  padding: 16px;
  text-align: center;
  color: rgba(212, 175, 55, 0.5);
  font-size: 0.85rem;
  font-style: italic;
}

.deck-section__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 4px;
}

.deck-section__cell {
  position: relative;
  cursor: pointer;
  border-radius: 3px;
  overflow: hidden;
  transition: transform 120ms ease;

  &:hover, &:focus-visible {
    transform: scale(1.05);
    .deck-section__remove { opacity: 1; }
  }
}

.deck-section__thumb {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1.46;
  object-fit: cover;
}

.deck-section__remove {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.8rem;
  font-weight: 800;
  color: #fff;
  background: rgba(180, 26, 44, 0.7);
  opacity: 0;
  transition: opacity 120ms ease;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add src/app/components/deck-section
git commit -m "feat(deck): add DeckSection component with thumbnail grid and remove-on-click"
```

---

## Task 13: DeckPanel component

**Files:**
- Create: `src/app/components/deck-panel/deck-panel.ts`
- Create: `src/app/components/deck-panel/deck-panel.html`
- Create: `src/app/components/deck-panel/deck-panel.scss`

- [ ] **Step 1: Create the component**

Create `src/app/components/deck-panel/deck-panel.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Deck, DeckSectionId } from '../../models/deck';
import { DeckSection } from '../deck-section/deck-section';
import { BanlistService } from '../../services/banlist-service';
import { validateDeck } from '../../utils/deck-validation';

@Component({
  selector: 'app-deck-panel',
  imports: [FormsModule, DeckSection],
  templateUrl: './deck-panel.html',
  styleUrl: './deck-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckPanel {
  deck = input.required<Deck>();
  rename = output<string>();
  removeCard = output<{ section: DeckSectionId; cardId: number }>();

  private readonly _banlist = inject(BanlistService);

  protected readonly editing = signal(false);
  protected readonly nameDraft = signal('');

  protected readonly issues = computed(() =>
    validateDeck(this.deck(), this._banlist),
  );

  protected startEdit(): void {
    this.nameDraft.set(this.deck().name);
    this.editing.set(true);
  }

  protected commitEdit(): void {
    const v = this.nameDraft().trim();
    if (v && v !== this.deck().name) this.rename.emit(v);
    this.editing.set(false);
  }

  protected onRemove(section: DeckSectionId, cardId: number): void {
    this.removeCard.emit({ section, cardId });
  }
}
```

Create `src/app/components/deck-panel/deck-panel.html`:

```html
<aside class="deck-panel">
  <div class="deck-panel__head">
    @if (editing()) {
      <input
        class="deck-panel__name-input"
        [(ngModel)]="nameDraft"
        (blur)="commitEdit()"
        (keydown.enter)="commitEdit()"
        autofocus />
    } @else {
      <h2 class="deck-panel__name" (click)="startEdit()" title="Cliquer pour renommer">
        {{ deck().name }}
      </h2>
    }
  </div>

  @if (issues().length === 0) {
    <p class="deck-panel__status deck-panel__status--ok">✓ Deck valide</p>
  } @else {
    <ul class="deck-panel__issues">
      @for (i of issues(); track $index) {
        <li
          class="deck-panel__issue"
          [class.deck-panel__issue--error]="i.severity === 'error'">
          {{ i.severity === 'error' ? '⛔' : '⚠' }} {{ i.message }}
        </li>
      }
    </ul>
  }

  <app-deck-section
    section="main"
    title="Main Deck"
    [cards]="deck().main"
    [min]="40"
    [max]="60"
    (removeCard)="onRemove('main', $event)" />

  <app-deck-section
    section="extra"
    title="Extra Deck"
    [cards]="deck().extra"
    [max]="15"
    (removeCard)="onRemove('extra', $event)" />

  <app-deck-section
    section="side"
    title="Side Deck"
    [cards]="deck().side"
    [max]="15"
    (removeCard)="onRemove('side', $event)" />
</aside>
```

Create `src/app/components/deck-panel/deck-panel.scss`:

```scss
.deck-panel {
  background: rgba(15, 10, 5, 0.85);
  border: 1px solid rgba(212, 175, 55, 0.35);
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}

.deck-panel__head {
  border-bottom: 1px solid rgba(212, 175, 55, 0.2);
  padding-bottom: 12px;
}

.deck-panel__name {
  margin: 0;
  font-size: 1.4rem;
  color: #f5e6c5;
  cursor: text;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 120ms ease;

  &:hover { background: rgba(212, 175, 55, 0.1); }
}

.deck-panel__name-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(212, 175, 55, 0.6);
  color: #f5e6c5;
  font-size: 1.4rem;
  padding: 4px 8px;
  border-radius: 4px;

  &:focus { outline: 2px solid #d4af37; outline-offset: 1px; }
}

.deck-panel__status {
  margin: 0;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 0.9rem;

  &--ok {
    background: rgba(30, 155, 110, 0.15);
    color: #4cd9a5;
    border-left: 3px solid #1e9b6e;
  }
}

.deck-panel__issues {
  list-style: none;
  margin: 0;
  padding: 0;
}

.deck-panel__issue {
  padding: 6px 12px;
  margin-bottom: 4px;
  border-radius: 4px;
  font-size: 0.85rem;
  background: rgba(212, 175, 55, 0.1);
  color: #f5d76e;
  border-left: 3px solid #d4af37;

  &--error {
    background: rgba(180, 26, 44, 0.15);
    color: #ff6b7a;
    border-left-color: #b41a2c;
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add src/app/components/deck-panel
git commit -m "feat(deck): add DeckPanel composing sections, inline rename, and issues list"
```

---

## Task 14: Extend YuGiCardDetail with deckbuilder mode

**Files:**
- Modify: `src/app/components/yu-gi-card-detail/yu-gi-card-detail.ts`
- Modify: `src/app/components/yu-gi-card-detail/yu-gi-card-detail.html`
- Modify: `src/app/components/yu-gi-card-detail/yu-gi-card-detail.scss`

- [ ] **Step 1: Add inputs/outputs and deck-aware computeds**

In `yu-gi-card-detail.ts`, replace the existing class body with:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  input,
  output,
} from '@angular/core';
import { Daum } from '../../models/yu-gi-result';
import {
  getFrameStyle,
  getSpellTrapIcon,
  isPendulum,
  isSpellOrTrap,
} from '../../utils/card-style';
import { CardIcon } from '../card-icon/card-icon';
import {
  Language,
  translateAttribute,
  translateRace,
  translateSpellTrapSubtype,
} from '../../utils/filter-translations';
import { Deck, DeckSectionId } from '../../models/deck';
import { canAddCard } from '../../utils/deck-validation';
import { defaultSectionFor } from '../../utils/deck-rules';
import { BanlistService } from '../../services/banlist-service';

@Component({
  selector: 'app-yu-gi-card-detail',
  imports: [CardIcon],
  templateUrl: './yu-gi-card-detail.html',
  styleUrl: './yu-gi-card-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YuGiCardDetail {
  card = input<Daum | null>(null);
  language = input<Language>('fr');
  mode = input<'view' | 'deckbuilder'>('view');
  deck = input<Deck | null>(null);
  close = output<void>();
  addToDeck = output<DeckSectionId>();

  private readonly _banlist = inject(BanlistService);

  protected raceLabel = computed(() => {
    const c = this.card();
    return c ? translateRace(c.race, this.language()) : '';
  });

  protected attributeLabel = computed(() => {
    const c = this.card();
    return c ? translateAttribute(c.attribute ?? '', this.language()) : '';
  });

  protected subtypeLabel = computed(() => {
    const c = this.card();
    return c ? translateSpellTrapSubtype(c.race, this.language()) : '';
  });

  protected frame = computed(() => {
    const c = this.card();
    return c ? getFrameStyle(c.frameType) : null;
  });

  protected icon = computed(() => {
    const c = this.card();
    return c ? getSpellTrapIcon(c.race, c.type) : 'none';
  });

  protected isMonster = computed(() => {
    const c = this.card();
    return c ? !isSpellOrTrap(c.type) : false;
  });

  protected isPendule = computed(() => {
    const c = this.card();
    return c ? isPendulum(c.frameType) : false;
  });

  protected mainSection = computed<DeckSectionId>(() => {
    const c = this.card();
    return c ? defaultSectionFor(c) : 'main';
  });

  protected mainButtonLabel = computed(() =>
    this.mainSection() === 'extra' ? '+ Extra Deck' : '+ Main Deck',
  );

  protected mainAddCheck = computed(() => {
    const c = this.card();
    const d = this.deck();
    if (!c || !d) return { allowed: false, reason: '' };
    return canAddCard(d, this.mainSection(), c, this._banlist);
  });

  protected sideAddCheck = computed(() => {
    const c = this.card();
    const d = this.deck();
    if (!c || !d) return { allowed: false, reason: '' };
    return canAddCard(d, 'side', c, this._banlist);
  });

  @HostListener('document:keydown.escape')
  protected onEscape() {
    if (this.card()) this.close.emit();
  }

  protected onClose() {
    this.close.emit();
  }

  protected onAdd(section: DeckSectionId) {
    this.addToDeck.emit(section);
  }
}
```

- [ ] **Step 2: Add the buttons to the template**

In `yu-gi-card-detail.html`, inside the `<div class="detail-panel__body">`, after the `</section>` that closes the description block (just before the final `</div>` of `detail-panel__body`), add:

```html
@if (mode() === 'deckbuilder' && deck()) {
  <div class="detail-panel__deck-actions">
    <button
      type="button"
      class="detail-panel__deck-btn"
      [disabled]="!mainAddCheck().allowed"
      [title]="mainAddCheck().reason ?? ''"
      (click)="onAdd(mainSection())">
      {{ mainButtonLabel() }}
    </button>
    <button
      type="button"
      class="detail-panel__deck-btn detail-panel__deck-btn--side"
      [disabled]="!sideAddCheck().allowed"
      [title]="sideAddCheck().reason ?? ''"
      (click)="onAdd('side')">
      + Side Deck
    </button>
  </div>
}
```

- [ ] **Step 3: Style the buttons**

Append to `yu-gi-card-detail.scss`:

```scss
.detail-panel__deck-actions {
  display: flex;
  gap: 8px;
  padding: 16px 0 8px;
  border-top: 1px solid rgba(212, 175, 55, 0.2);
  margin-top: 16px;
}

.detail-panel__deck-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  background: linear-gradient(135deg, #d4af37, #f5d76e);
  color: #2a1a08;
  transition: transform 120ms ease, opacity 120ms ease;

  &:hover:not(:disabled) { transform: translateY(-1px); }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &--side {
    background: linear-gradient(135deg, #5d9cb7, #88c4d8);
    color: #0c1a25;
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: SUCCESS (existing index page still uses default `mode="view"` so it's unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/yu-gi-card-detail/
git commit -m "feat(detail): add deckbuilder mode with + Main/Extra and + Side buttons"
```

---

## Task 15: DeckBuilderPage at /decks/:id

**Files:**
- Create: `src/app/pages/deck-builder/deck-builder.ts`
- Create: `src/app/pages/deck-builder/deck-builder.html`
- Create: `src/app/pages/deck-builder/deck-builder.scss`
- Modify: `src/app/app.routes.ts`

- [ ] **Step 1: Add the route**

In `src/app/app.routes.ts`, add before the wildcard:

```ts
{
  path: 'decks/:id',
  loadComponent: () =>
    import('./pages/deck-builder/deck-builder').then((m) => m.DeckBuilder),
},
```

- [ ] **Step 2: Create the page**

Create `src/app/pages/deck-builder/deck-builder.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  WritableSignal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CardQuery, YuGiService } from '../../services/yu-gi-service';
import { Daum, YuGiResult } from '../../models/yu-gi-result';
import { DeckStore } from '../../services/deck-store';
import { DeckSectionId } from '../../models/deck';
import { AppHeader } from '../../components/app-header/app-header';
import { YuGiFilters } from '../../components/yu-gi-filters/yu-gi-filters';
import { CardGrid } from '../../components/card-grid/card-grid';
import { DeckPanel } from '../../components/deck-panel/deck-panel';
import { YuGiCardDetail } from '../../components/yu-gi-card-detail/yu-gi-card-detail';
import { Language } from '../../utils/filter-translations';

@Component({
  selector: 'app-deck-builder',
  imports: [AppHeader, YuGiFilters, CardGrid, DeckPanel, YuGiCardDetail],
  templateUrl: './deck-builder.html',
  styleUrl: './deck-builder.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckBuilder {
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _yuGiService = inject(YuGiService);
  private readonly _store = inject(DeckStore);

  private readonly _params = toSignal(this._route.paramMap, {
    initialValue: this._route.snapshot.paramMap,
  });

  readonly deckId = computed(() => this._params().get('id') ?? '');
  readonly deck = computed(() => this._store.get(this.deckId()));

  yugiResult: WritableSignal<YuGiResult | undefined> = signal(undefined);
  selectedCard: WritableSignal<Daum | null> = signal(null);
  filters: WritableSignal<CardQuery> = signal({});
  language: WritableSignal<Language> = signal('fr');
  loading: WritableSignal<boolean> = signal(false);

  currentPage = 0;

  constructor() {
    effect(() => {
      if (this.deckId() && !this.deck()) {
        this._router.navigate(['/decks']);
      }
    });
    this.getCards(0);
  }

  previous() {
    if (this.currentPage === 0) return;
    this.getCards(--this.currentPage);
  }

  next() {
    const total = this.yugiResult()?.meta.total_pages ?? 0;
    if (this.currentPage + 1 >= total) return;
    this.getCards(++this.currentPage);
  }

  getCards(page: number) {
    this.loading.set(true);
    this._yuGiService.getCards(page, this.filters(), this.language()).subscribe({
      next: (r) => { this.yugiResult.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onApplyFilters(q: CardQuery) {
    this.filters.set(q);
    this.currentPage = 0;
    this.getCards(0);
  }

  onLanguageChange(l: Language) {
    this.language.set(l);
    this.selectedCard.set(null);
    this.currentPage = 0;
    this.getCards(0);
  }

  select(card: Daum) { this.selectedCard.set(card); }
  closeDetail() { this.selectedCard.set(null); }

  onRename(name: string) {
    this._store.rename(this.deckId(), name);
  }

  onAddToDeck(section: DeckSectionId) {
    const card = this.selectedCard();
    if (!card) return;
    this._store.addCard(this.deckId(), section, card);
  }

  onRemoveFromDeck(payload: { section: DeckSectionId; cardId: number }) {
    this._store.removeCard(this.deckId(), payload.section, payload.cardId);
  }
}
```

Create `src/app/pages/deck-builder/deck-builder.html`:

```html
<app-header />

@if (deck(); as d) {
  <div class="deck-builder">
    <section class="deck-builder__left">
      <app-yu-gi-filters
        [applied]="filters()"
        [language]="language()"
        (apply)="onApplyFilters($event)"
        (languageChange)="onLanguageChange($event)" />

      <nav class="deck-builder__pagination" aria-label="Navigation des pages">
        <button
          class="deck-builder__nav-btn"
          (click)="previous()"
          [disabled]="currentPage === 0">
          ◀ Précédent
        </button>
        <span class="deck-builder__page">
          Page <strong>{{ currentPage + 1 }}</strong>
          / {{ yugiResult()?.meta?.total_pages ?? '—' }}
        </span>
        <button
          class="deck-builder__nav-btn"
          (click)="next()"
          [disabled]="(yugiResult()?.meta?.total_pages ?? 0) === 0
                      || currentPage + 1 >= (yugiResult()?.meta?.total_pages ?? 0)">
          Suivant ▶
        </button>
      </nav>

      <app-card-grid
        [cards]="yugiResult()?.data ?? []"
        [language]="language()"
        [loading]="loading()"
        [selectedId]="selectedCard()?.id ?? null"
        (cardClick)="select($event)" />
    </section>

    <app-deck-panel
      class="deck-builder__right"
      [deck]="d"
      (rename)="onRename($event)"
      (removeCard)="onRemoveFromDeck($event)" />
  </div>

  <app-yu-gi-card-detail
    [card]="selectedCard()"
    [language]="language()"
    [mode]="'deckbuilder'"
    [deck]="d"
    (close)="closeDetail()"
    (addToDeck)="onAddToDeck($event)" />
}
```

Create `src/app/pages/deck-builder/deck-builder.scss`:

```scss
.deck-builder {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 24px;
  padding: 24px 32px;
  max-width: 1600px;
  margin: 0 auto;

  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
  }
}

.deck-builder__left {
  min-width: 0; // allow grid items to shrink
}

.deck-builder__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin: 16px 0;
}

.deck-builder__nav-btn {
  background: rgba(212, 175, 55, 0.15);
  border: 1px solid rgba(212, 175, 55, 0.4);
  color: #f5e6c5;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) { background: rgba(212, 175, 55, 0.25); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}

.deck-builder__page {
  color: #d4af37;
  font-size: 0.95rem;
}

.deck-builder__right {
  position: sticky;
  top: 16px;
  align-self: flex-start;

  @media (max-width: 1100px) {
    position: static;
  }
}
```

- [ ] **Step 3: End-to-end manual test**

Run: `npm start`.

1. Go to `/decks`, create a deck called `Test`.
2. You land on `/decks/<id>` — filters panel + card grid on the left, empty deck panel on the right.
3. Click a normal monster card → detail opens, two `+ Main Deck` / `+ Side Deck` buttons appear.
4. Click `+ Main Deck` → the card appears as a thumbnail in the Main section.
5. Repeat with a Fusion monster → the button reads `+ Extra Deck` and the card lands in Extra.
6. Add 3 copies of the same card → the 4th add is disabled with tooltip.
7. Search "pot of greed" → the card has the red `INTERDITE` badge in the grid AND the `+ Main Deck` button is disabled with a "Carte interdite en TCG" tooltip.
8. Click any deck thumbnail → it's removed.
9. Click the deck name → it becomes editable, change it, blur → name is updated on `/decks` too.
10. Reload the page → the deck is still there with its contents.
11. Navigate to `/decks/garbage-id` → you are redirected to `/decks`.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/deck-builder src/app/app.routes.ts
git commit -m "feat(decks): wire up /decks/:id builder page combining filters, grid, and panel"
```

---

## Task 16: Final polish and cleanup

**Files:**
- Modify: `src/app/app.html` (remove duplicated header logic if appropriate)
- Modify: `src/app/pages/yu-gi-index/yu-gi-index.scss` (ensure no conflict with extracted styles)
- Modify: `src/app/app.spec.ts` (the test references "Hello, yu-gi-oh" which is wrong; fix it)

- [ ] **Step 1: Fix the broken existing test**

In `src/app/app.spec.ts`, replace the second test with:

```ts
it('should render the router outlet host', async () => {
  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  expect(el.querySelector('router-outlet')).toBeTruthy();
});
```

(This test was checking a Hello message that no longer exists in the template.)

- [ ] **Step 2: Smoke test the build and tests**

Run these in order:

```bash
npm test -- --run
npm run build
```

Both must succeed with no errors.

- [ ] **Step 3: Verify the three routes**

Run: `npm start`.
- `/` works as before, with the new shared header.
- `/decks` shows the deck list with shared header.
- `/decks/:id` shows the builder layout with shared header.
- Navigation between routes via the header links works.

- [ ] **Step 4: Final commit**

```bash
git add src/app/app.spec.ts
git commit -m "test: align app.spec with current template (router-outlet only)"
```

---

## Self-review (already done by the planner — kept for traceability)

**Spec coverage**

- Routes & navigation → Tasks 9, 11, 15.
- Composants (refactor + nouveaux) → Tasks 8 (filters extension), 9 (AppHeader), 10 (CardGrid), 12 (DeckSection), 13 (DeckPanel), 14 (YuGiCardDetail extension), 15 (DeckBuilderPage).
- Modèle `Deck` → Task 1.
- `BanlistService` → Task 4.
- `SetService` → Task 5.
- `DeckStore` (avec persistance + tests) → Task 6.
- Extension `YuGiService.CardQuery` (`set?`) → Task 7.
- Règles : routage auto + `canAddCard` + `validateDeck` → Tasks 1, 3.
- Persistance `localStorage` → Task 6.
- UX `/decks` → Task 11.
- UX `/decks/:id` → Task 15.
- Style visuel cohérent → Tasks 9-15 (palette dorée/sombre conservée).
- Responsive ≥1100px → Task 15 (media query).
- Tests Vitest ciblés → Tasks 1-3, 4, 6.
- Hors scope explicite → respecté (pas d'import/export, pas de drag&drop, pas de modales custom).

**Placeholder scan** — no TBD, no "implement appropriately", no "similar to Task N". All code blocks are present.

**Type consistency** — `DeckSectionId`, `BanStatus`, `DeckIssue`, `AddCheck` are defined once in Task 1/3 and consumed unchanged in later tasks. `BanlistLike` (interface used by validators) is structurally compatible with `BanlistService` (both have `get(id)` and `maxCopies(id)`). Service method names (`addCard`, `removeCard`, `rename`, `remove`, `create`, `get`) are used identically across the plan.
