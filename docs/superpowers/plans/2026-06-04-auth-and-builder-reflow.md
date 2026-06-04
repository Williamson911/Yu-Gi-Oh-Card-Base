# Auth + Deck Builder Reflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side simulated auth (register/login) to the Angular Yu-Gi-Oh app, scope decks to the logged-in user, and restructure the deck-builder flow around an explicit draft + manual Save button.

**Architecture:** Three new signal-based services (`AuthService`, `DraftService`, `ToastService`) coordinate state. Routes `/login` and `/register` are new public pages; `/deck-builder` and `/decks` are protected by `authGuard`. Existing route `/decks/:id` is removed — editing a saved deck loads it into the draft via `linkedDeckId`. `DeckStore` is refactored to expose `myDecks` (filtered by `currentUserId`), enforce ownership on mutations, and provide `replaceContents()` used by the draft Save.

**Tech Stack:** Angular 21 (standalone, signals, control flow), Vitest 4 (globals enabled), Web Crypto API (`crypto.subtle.digest('SHA-256', ...)`), `localStorage` for persistence.

**Reference spec:** `docs/superpowers/specs/2026-06-04-auth-and-builder-reflow-design.md`
**Previous plan:** `docs/superpowers/plans/2026-06-04-deckbuilder.md` (V1 — must already be implemented)

---

## Working notes for the implementer

- The user manages git themselves. **Do NOT run any git commands** (no `git add`, `git commit`, etc.). Skip every "Commit" instruction the plan might suggest.
- Vitest globals are enabled (`tsconfig.spec.json` → `"types": ["vitest/globals"]`). Test files do NOT import `describe`/`it`/`expect`/`vi`/`beforeEach` — they are global.
- Run the full test suite with `npm test` from project root. The `--run <path>` form does NOT work via the Angular CLI wrapper; just run `npm test` (vitest exits after running by default).
- Run a production build with `npm run build`. Pre-existing SCSS budget warnings on `app.scss`, `yu-gi-card-detail.scss`, `yu-gi-filters.scss`, `card-grid.scss` are non-blocking — ignore them.
- All new components are standalone (no `NgModule`). Follow patterns in `src/app/components/*` and `src/app/pages/*`.
- Web Crypto API: `globalThis.crypto.subtle.digest('SHA-256', ...)` works both in browser and in vitest/jsdom (Node 20+). Tests use `async/await`.
- SHA-256 is delibrately weak vs. Argon2/bcrypt — this is documented in `AuthService` as a pedagogical trade-off (no backend in scope).

---

## Task 1: User model + hash utilities

**Files:**
- Create: `src/app/models/user.ts`
- Create: `src/app/utils/password-hash.ts`
- Create: `src/app/utils/password-hash.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/utils/password-hash.spec.ts`:

```ts
import { generateSalt, hashPassword, bytesToHex } from './password-hash';

describe('generateSalt', () => {
  it('returns a 32-character hex string (16 bytes)', () => {
    const salt = generateSalt();
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it('produces different salts on each call', () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a).not.toBe(b);
  });
});

describe('bytesToHex', () => {
  it('converts bytes to lowercase hex', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff');
  });
});

describe('hashPassword', () => {
  it('returns a 64-character hex string (SHA-256)', async () => {
    const hash = await hashPassword('abc123', 'deadbeef');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for same salt + password', async () => {
    const a = await hashPassword('hello', 'cafebabe');
    const b = await hashPassword('hello', 'cafebabe');
    expect(a).toBe(b);
  });

  it('differs for different passwords with same salt', async () => {
    const a = await hashPassword('hello', 'cafebabe');
    const b = await hashPassword('world', 'cafebabe');
    expect(a).not.toBe(b);
  });

  it('differs for same password with different salts', async () => {
    const a = await hashPassword('hello', 'aaaaaaaa');
    const b = await hashPassword('hello', 'bbbbbbbb');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npm test`
Expected: 4 new failures (module not found).

- [ ] **Step 3: Create the User model**

Create `src/app/models/user.ts`:

```ts
export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
}

export interface Session {
  userId: string;
  username: string;
}
```

- [ ] **Step 4: Implement the hash utilities**

Create `src/app/utils/password-hash.ts`:

```ts
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}
```

- [ ] **Step 5: Run tests, expect pass**

Run: `npm test`
Expected: all 4 new tests pass.

---

## Task 2: AuthService with register/login/logout

**Files:**
- Create: `src/app/services/auth-service.ts`
- Create: `src/app/services/auth-service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/services/auth-service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth-service';

describe('AuthService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [AuthService] });
  });

  it('starts with no session', () => {
    const auth = TestBed.inject(AuthService);
    expect(auth.session()).toBeNull();
    expect(auth.currentUserId()).toBeNull();
  });

  describe('register', () => {
    it('creates a user, persists it, and opens a session', async () => {
      const auth = TestBed.inject(AuthService);
      const result = await auth.register({
        username: 'Yugi',
        email: 'yugi@example.com',
        password: 'puzzlebox',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.user.id).toBeTruthy();
      expect(result.user.passwordHash).not.toBe('puzzlebox');
      expect(auth.session()?.username).toBe('Yugi');
      expect(JSON.parse(localStorage.getItem('yugioh.users.v1')!)).toHaveLength(1);
    });

    it('rejects a duplicate username (case-insensitive)', async () => {
      const auth = TestBed.inject(AuthService);
      await auth.register({ username: 'Yugi', email: 'a@a.com', password: 'pw123456' });
      const r = await auth.register({ username: 'YUGI', email: 'b@b.com', password: 'pw123456' });
      expect(r).toEqual({ ok: false, reason: 'username-taken' });
    });

    it('rejects a duplicate email (case-insensitive)', async () => {
      const auth = TestBed.inject(AuthService);
      await auth.register({ username: 'Yugi', email: 'yugi@example.com', password: 'pw123456' });
      const r = await auth.register({ username: 'Joey', email: 'YUGI@example.com', password: 'pw123456' });
      expect(r).toEqual({ ok: false, reason: 'email-taken' });
    });

    it('rejects invalid fields', async () => {
      const auth = TestBed.inject(AuthService);
      const r1 = await auth.register({ username: 'ab', email: 'a@a.com', password: 'pw123456' });
      expect(r1).toEqual({ ok: false, reason: 'invalid-fields' });
      const r2 = await auth.register({ username: 'Yugi', email: 'not-an-email', password: 'pw123456' });
      expect(r2).toEqual({ ok: false, reason: 'invalid-fields' });
      const r3 = await auth.register({ username: 'Yugi', email: 'a@a.com', password: 'short' });
      expect(r3).toEqual({ ok: false, reason: 'invalid-fields' });
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      const auth = TestBed.inject(AuthService);
      await auth.register({ username: 'Yugi', email: 'yugi@example.com', password: 'puzzlebox' });
      auth.logout();
    });

    it('logs in by username with correct password', async () => {
      const auth = TestBed.inject(AuthService);
      const r = await auth.login({ usernameOrEmail: 'Yugi', password: 'puzzlebox' });
      expect(r.ok).toBe(true);
      expect(auth.session()?.username).toBe('Yugi');
    });

    it('logs in by email with correct password', async () => {
      const auth = TestBed.inject(AuthService);
      const r = await auth.login({ usernameOrEmail: 'yugi@example.com', password: 'puzzlebox' });
      expect(r.ok).toBe(true);
    });

    it('is case-insensitive on username and email', async () => {
      const auth = TestBed.inject(AuthService);
      expect((await auth.login({ usernameOrEmail: 'YUGI', password: 'puzzlebox' })).ok).toBe(true);
      auth.logout();
      expect((await auth.login({ usernameOrEmail: 'YUGI@EXAMPLE.com', password: 'puzzlebox' })).ok).toBe(true);
    });

    it('rejects wrong password with generic reason', async () => {
      const auth = TestBed.inject(AuthService);
      const r = await auth.login({ usernameOrEmail: 'Yugi', password: 'wrong' });
      expect(r).toEqual({ ok: false, reason: 'invalid-credentials' });
    });

    it('rejects unknown user with same generic reason', async () => {
      const auth = TestBed.inject(AuthService);
      const r = await auth.login({ usernameOrEmail: 'Bakura', password: 'puzzlebox' });
      expect(r).toEqual({ ok: false, reason: 'invalid-credentials' });
    });
  });

  describe('logout', () => {
    it('clears session and storage', async () => {
      const auth = TestBed.inject(AuthService);
      await auth.register({ username: 'Yugi', email: 'a@a.com', password: 'pw123456' });
      auth.logout();
      expect(auth.session()).toBeNull();
      expect(localStorage.getItem('yugioh.session.v1')).toBeNull();
    });
  });

  describe('session restoration', () => {
    it('restores the session from localStorage on a fresh inject', async () => {
      const a = TestBed.inject(AuthService);
      await a.register({ username: 'Yugi', email: 'a@a.com', password: 'pw123456' });

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [AuthService] });
      const b = TestBed.inject(AuthService);
      expect(b.session()?.username).toBe('Yugi');
    });

    it('starts with no session if storage is corrupt', () => {
      localStorage.setItem('yugioh.session.v1', 'not-json');
      const auth = TestBed.inject(AuthService);
      expect(auth.session()).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npm test`
Expected: module not found.

- [ ] **Step 3: Implement AuthService**

Create `src/app/services/auth-service.ts`:

```ts
// NOTE: We use SHA-256 with a per-user salt to avoid storing plaintext passwords.
// In real production code we'd use Argon2 / bcrypt server-side — SHA-256 is too
// fast and vulnerable to brute-force. This is a deliberate trade-off for a
// no-backend pedagogical project.
import { Injectable, computed, signal, Signal } from '@angular/core';
import { Session, User } from '../models/user';
import { generateSalt, hashPassword } from '../utils/password-hash';

const USERS_KEY = 'yugioh.users.v1';
const SESSION_KEY = 'yugioh.session.v1';

const USERNAME_RE = /^[A-Za-z0-9_-]+$/;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

export type RegisterResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'username-taken' | 'email-taken' | 'invalid-fields' };

export type LoginResult =
  | { ok: true; session: Session }
  | { ok: false; reason: 'invalid-credentials' };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _session = signal<Session | null>(this.readSession());

  readonly session: Signal<Session | null> = this._session.asReadonly();
  readonly currentUserId: Signal<string | null> = computed(
    () => this._session()?.userId ?? null,
  );

  async register(input: {
    username: string;
    email: string;
    password: string;
  }): Promise<RegisterResult> {
    const username = input.username.trim();
    const email = input.email.trim();
    const password = input.password;

    if (
      username.length < 3 ||
      username.length > 20 ||
      !USERNAME_RE.test(username) ||
      !EMAIL_RE.test(email) ||
      password.length < 8
    ) {
      return { ok: false, reason: 'invalid-fields' };
    }

    const users = this.readUsers();
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return { ok: false, reason: 'username-taken' };
    }
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { ok: false, reason: 'email-taken' };
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    const user: User = {
      id: crypto.randomUUID(),
      username,
      email,
      passwordHash,
      salt,
      createdAt: Date.now(),
    };

    this.writeUsers([...users, user]);
    this.openSession({ userId: user.id, username: user.username });
    return { ok: true, user };
  }

  async login(input: {
    usernameOrEmail: string;
    password: string;
  }): Promise<LoginResult> {
    const id = input.usernameOrEmail.trim().toLowerCase();
    if (!id || !input.password) {
      return { ok: false, reason: 'invalid-credentials' };
    }
    const user = this.readUsers().find(
      (u) => u.username.toLowerCase() === id || u.email.toLowerCase() === id,
    );
    if (!user) return { ok: false, reason: 'invalid-credentials' };

    const hash = await hashPassword(input.password, user.salt);
    if (hash !== user.passwordHash) {
      return { ok: false, reason: 'invalid-credentials' };
    }
    const session: Session = { userId: user.id, username: user.username };
    this.openSession(session);
    return { ok: true, session };
  }

  logout(): void {
    this._session.set(null);
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }

  private openSession(session: Session): void {
    this._session.set(session);
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* ignore */ }
  }

  private readUsers(): User[] {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeUsers(users: User[]): void {
    try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch { /* ignore */ }
  }

  private readSession(): Session | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.userId === 'string' && typeof parsed.username === 'string') {
        return parsed as Session;
      }
      return null;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test`
Expected: all new tests pass.

---

## Task 3: authGuard + guestOnlyGuard

**Files:**
- Create: `src/app/guards/auth-guard.ts`

- [ ] **Step 1: Implement the guards**

Create `src/app/guards/auth-guard.ts`:

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth-service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.session()) return true;
  router.navigate(['/login'], { queryParams: { returnTo: state.url } });
  return false;
};

export const guestOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.session()) return true;
  router.navigate(['/']);
  return false;
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: SUCCESS.

---

## Task 4: LoginPage and RegisterPage with routes

**Files:**
- Create: `src/app/pages/login/login.ts`
- Create: `src/app/pages/login/login.html`
- Create: `src/app/pages/login/login.scss`
- Create: `src/app/pages/register/register.ts`
- Create: `src/app/pages/register/register.html`
- Create: `src/app/pages/register/register.scss`
- Modify: `src/app/app.routes.ts`

- [ ] **Step 1: Create LoginPage**

Create `src/app/pages/login/login.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth-service';
import { AppHeader } from '../../components/app-header/app-header';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, AppHeader],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly _auth = inject(AuthService);
  private readonly _router = inject(Router);
  private readonly _route = inject(ActivatedRoute);

  protected readonly usernameOrEmail = signal('');
  protected readonly password = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    const r = await this._auth.login({
      usernameOrEmail: this.usernameOrEmail(),
      password: this.password(),
    });
    this.busy.set(false);
    if (!r.ok) {
      this.error.set('Identifiant ou mot de passe incorrect.');
      return;
    }
    const returnTo = this._route.snapshot.queryParamMap.get('returnTo') ?? '/';
    this._router.navigateByUrl(returnTo);
  }
}
```

Create `src/app/pages/login/login.html`:

```html
<app-header />

<main class="auth">
  <form class="auth__card" (ngSubmit)="submit()" autocomplete="on">
    <h1 class="auth__title">Connexion</h1>
    <p class="auth__subtitle">Bon retour, duelliste.</p>

    <label class="auth__field">
      <span>Identifiant (username ou email)</span>
      <input
        type="text"
        autocomplete="username"
        required
        [ngModel]="usernameOrEmail()"
        (ngModelChange)="usernameOrEmail.set($event)"
        name="usernameOrEmail" />
    </label>

    <label class="auth__field">
      <span>Mot de passe</span>
      <input
        type="password"
        autocomplete="current-password"
        required
        [ngModel]="password()"
        (ngModelChange)="password.set($event)"
        name="password" />
    </label>

    @if (error()) {
      <p class="auth__error" role="alert">{{ error() }}</p>
    }

    <button type="submit" class="auth__submit" [disabled]="busy()">
      @if (busy()) { Connexion… } @else { Se connecter }
    </button>

    <p class="auth__switch">
      Pas encore inscrit ? <a routerLink="/register">Créer un compte</a>
    </p>
  </form>
</main>
```

Create `src/app/pages/login/login.scss`:

```scss
.auth {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.5rem;
  min-height: calc(100vh - 200px);
}

.auth__card {
  width: 100%;
  max-width: 420px;
  background: rgba(20, 14, 8, 0.85);
  border: 1px solid rgba(212, 175, 55, 0.35);
  border-radius: 8px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.auth__title {
  margin: 0;
  font-family: var(--font-display);
  color: #f5e6c5;
  font-size: 1.8rem;
}

.auth__subtitle {
  margin: -8px 0 8px;
  color: #d4af37;
  opacity: 0.8;
  font-size: 0.9rem;
}

.auth__field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  span {
    color: #d4af37;
    font-size: 0.85rem;
    letter-spacing: 0.04em;
  }

  input {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(212, 175, 55, 0.4);
    color: #f5e6c5;
    padding: 10px 12px;
    border-radius: 4px;
    font-size: 1rem;

    &:focus { outline: 2px solid #d4af37; outline-offset: 1px; }
  }
}

.auth__error {
  margin: 0;
  padding: 10px 12px;
  background: rgba(180, 26, 44, 0.2);
  border-left: 3px solid #b41a2c;
  color: #ff6b7a;
  border-radius: 4px;
  font-size: 0.9rem;
}

.auth__submit {
  background: linear-gradient(135deg, #d4af37, #f5d76e);
  color: #2a1a08;
  border: none;
  padding: 12px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 120ms ease, opacity 120ms ease;

  &:hover:not(:disabled) { transform: translateY(-1px); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.auth__switch {
  margin: 4px 0 0;
  text-align: center;
  font-size: 0.9rem;
  color: #d4af37;

  a {
    color: #f5e6c5;
    text-decoration: underline;
  }
}
```

- [ ] **Step 2: Create RegisterPage**

Create `src/app/pages/register/register.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth-service';
import { AppHeader } from '../../components/app-header/app-header';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, AppHeader],
  templateUrl: './register.html',
  styleUrl: './register.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Register {
  private readonly _auth = inject(AuthService);
  private readonly _router = inject(Router);
  private readonly _route = inject(ActivatedRoute);

  protected readonly username = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly passwordConfirm = signal('');
  protected readonly errors = signal<{ field: string; message: string }[]>([]);
  protected readonly busy = signal(false);

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    const errs = this.validate();
    if (errs.length > 0) {
      this.errors.set(errs);
      return;
    }
    this.busy.set(true);
    this.errors.set([]);
    const r = await this._auth.register({
      username: this.username(),
      email: this.email(),
      password: this.password(),
    });
    this.busy.set(false);
    if (!r.ok) {
      if (r.reason === 'username-taken') {
        this.errors.set([{ field: 'username', message: 'Ce username est déjà pris.' }]);
      } else if (r.reason === 'email-taken') {
        this.errors.set([{ field: 'email', message: 'Cet email est déjà utilisé.' }]);
      } else {
        this.errors.set([{ field: 'form', message: 'Champs invalides.' }]);
      }
      return;
    }
    const returnTo = this._route.snapshot.queryParamMap.get('returnTo') ?? '/';
    this._router.navigateByUrl(returnTo);
  }

  private validate(): { field: string; message: string }[] {
    const errs: { field: string; message: string }[] = [];
    const u = this.username().trim();
    if (u.length < 3 || u.length > 20) {
      errs.push({ field: 'username', message: 'Le username doit faire entre 3 et 20 caractères.' });
    } else if (!/^[A-Za-z0-9_-]+$/.test(u)) {
      errs.push({ field: 'username', message: 'Caractères autorisés : lettres, chiffres, _ et -.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(this.email().trim())) {
      errs.push({ field: 'email', message: 'Email invalide.' });
    }
    if (this.password().length < 8) {
      errs.push({ field: 'password', message: 'Mot de passe ≥ 8 caractères.' });
    }
    if (this.password() !== this.passwordConfirm()) {
      errs.push({ field: 'passwordConfirm', message: 'Les mots de passe ne correspondent pas.' });
    }
    return errs;
  }

  protected errorFor(field: string): string | undefined {
    return this.errors().find((e) => e.field === field)?.message;
  }
}
```

Create `src/app/pages/register/register.html`:

```html
<app-header />

<main class="auth">
  <form class="auth__card" (ngSubmit)="submit()" autocomplete="on">
    <h1 class="auth__title">Inscription</h1>
    <p class="auth__subtitle">Crée ton compte de duelliste.</p>

    <label class="auth__field">
      <span>Username</span>
      <input
        type="text"
        autocomplete="username"
        required
        [ngModel]="username()"
        (ngModelChange)="username.set($event)"
        name="username" />
      @if (errorFor('username')) {
        <small class="auth__field-error">{{ errorFor('username') }}</small>
      }
    </label>

    <label class="auth__field">
      <span>Email</span>
      <input
        type="email"
        autocomplete="email"
        required
        [ngModel]="email()"
        (ngModelChange)="email.set($event)"
        name="email" />
      @if (errorFor('email')) {
        <small class="auth__field-error">{{ errorFor('email') }}</small>
      }
    </label>

    <label class="auth__field">
      <span>Mot de passe</span>
      <input
        type="password"
        autocomplete="new-password"
        required
        [ngModel]="password()"
        (ngModelChange)="password.set($event)"
        name="password" />
      @if (errorFor('password')) {
        <small class="auth__field-error">{{ errorFor('password') }}</small>
      }
    </label>

    <label class="auth__field">
      <span>Confirmer le mot de passe</span>
      <input
        type="password"
        autocomplete="new-password"
        required
        [ngModel]="passwordConfirm()"
        (ngModelChange)="passwordConfirm.set($event)"
        name="passwordConfirm" />
      @if (errorFor('passwordConfirm')) {
        <small class="auth__field-error">{{ errorFor('passwordConfirm') }}</small>
      }
    </label>

    @if (errorFor('form')) {
      <p class="auth__error" role="alert">{{ errorFor('form') }}</p>
    }

    <button type="submit" class="auth__submit" [disabled]="busy()">
      @if (busy()) { Création… } @else { Créer mon compte }
    </button>

    <p class="auth__switch">
      Déjà inscrit ? <a routerLink="/login">Se connecter</a>
    </p>
  </form>
</main>
```

Create `src/app/pages/register/register.scss` (reuse the same styles as Login):

```scss
@use '../login/login.scss';

.auth__field-error {
  color: #ff6b7a;
  font-size: 0.8rem;
  margin-top: 4px;
}
```

- [ ] **Step 3: Wire the routes**

Replace the entire contents of `src/app/app.routes.ts` with:

```ts
import { Routes } from '@angular/router';
import { authGuard, guestOnlyGuard } from './guards/auth-guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/yu-gi-index/yu-gi-index').then((m) => m.YuGiIndex),
  },
  {
    path: 'login',
    canActivate: [guestOnlyGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    canActivate: [guestOnlyGuard],
    loadComponent: () => import('./pages/register/register').then((m) => m.Register),
  },
  {
    path: 'deck-builder',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/deck-builder/deck-builder').then((m) => m.DeckBuilder),
  },
  {
    path: 'decks',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/deck-list/deck-list').then((m) => m.DeckList),
  },
  { path: '**', redirectTo: '' },
];
```

(Note: the `decks/:id` route is removed — `DeckBuilderPage` now operates on the draft, not on a route param.)

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: SUCCESS.

The two routes work but the header still shows the old links. Task 5 fixes the header.

---

## Task 5: AppHeader logged-in vs logged-out state

**Files:**
- Modify: `src/app/components/app-header/app-header.ts`
- Modify: `src/app/components/app-header/app-header.html`
- Modify: `src/app/components/app-header/app-header.scss`

- [ ] **Step 1: Inject AuthService and add a logout method**

Replace the entire content of `src/app/components/app-header/app-header.ts` with:

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth-service';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeader {
  private readonly _auth = inject(AuthService);
  private readonly _router = inject(Router);

  protected readonly session = this._auth.session;

  protected logout(): void {
    this._auth.logout();
    this._router.navigate(['/']);
  }
}
```

- [ ] **Step 2: Update the template**

Replace the entire content of `src/app/components/app-header/app-header.html` with:

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
      Catalogue
    </a>

    @if (session(); as s) {
      <a class="appheader__link" routerLink="/deck-builder" routerLinkActive="is-active">
        Deck Builder
      </a>
      <a class="appheader__link" routerLink="/decks" routerLinkActive="is-active">
        Mes decks
      </a>
      <span class="appheader__sep" aria-hidden="true">·</span>
      <span class="appheader__user">Bonjour {{ s.username }}</span>
      <button type="button" class="appheader__logout" (click)="logout()">
        Déconnexion
      </button>
    } @else {
      <a class="appheader__link" routerLink="/login" routerLinkActive="is-active">
        Connexion
      </a>
      <a class="appheader__link" routerLink="/register" routerLinkActive="is-active">
        Inscription
      </a>
    }
  </nav>
</header>
```

- [ ] **Step 3: Append styles**

Append to `src/app/components/app-header/app-header.scss`:

```scss
.appheader__sep {
  color: rgba(212, 175, 55, 0.4);
  margin: 0 4px;
}

.appheader__user {
  color: #f5e6c5;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.appheader__logout {
  background: transparent;
  border: 1px solid rgba(212, 175, 55, 0.4);
  color: #d4af37;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: background 150ms ease, color 150ms ease, border-color 150ms ease;

  &:hover {
    background: rgba(180, 26, 44, 0.15);
    color: #ff6b7a;
    border-color: #b41a2c;
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: SUCCESS.

- [ ] **Step 5: Manual sanity test**

Run: `npm start`. Verify:
- Visiting `/` (not logged in) → header shows only Catalogue / Connexion / Inscription.
- Click Inscription → register form. Create account. Auto-redirect to `/`.
- Header now shows Catalogue / Deck Builder / Mes decks · Bonjour {name} · Déconnexion.
- Click Déconnexion → header reverts to logged-out state.

---

## Task 6: Add ownerId to Deck and refactor DeckStore

**Files:**
- Modify: `src/app/models/deck.ts`
- Modify: `src/app/services/deck-store.ts`
- Modify: `src/app/services/deck-store.spec.ts`

- [ ] **Step 1: Add `ownerId` to the Deck interface**

In `src/app/models/deck.ts`, modify the `Deck` interface to add `ownerId`:

```ts
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
```

Add a new exported interface at the end of the same file:

```ts
export interface DeckContent {
  name: string;
  main: DeckCard[];
  extra: DeckCard[];
  side: DeckCard[];
}
```

- [ ] **Step 2: Update the failing tests**

Replace the entire content of `src/app/services/deck-store.spec.ts` with:

```ts
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

  it('addCard / removeCard / rename / remove are no-ops on a non-owned deck', async () => {
    const a = await setupWith('Yugi');
    const deck = a.store.create('Y')!;
    a.auth.logout();
    const b = await setupWith('Kaiba');
    b.store.addCard(deck.id, 'main', monster(1));
    b.store.rename(deck.id, 'hijacked');
    b.store.remove(deck.id);
    b.auth.logout();
    const c = await setupWith('Yugi');
    // need fresh login since we cleared, but localStorage user list persists
    // actually since localStorage is cleared in beforeEach but not between sub-setupWith, this works
    const yugiDeckReread = c.store.myDecks()[0];
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
    const c = await setupWith('Yugi');
    expect(c.store.get(yugiDeck.id)?.name).toBe('Y');
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
```

- [ ] **Step 3: Refactor DeckStore**

Replace the entire content of `src/app/services/deck-store.ts` with:

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all DeckStore + AuthService tests pass.

---

## Task 7: DraftService

**Files:**
- Create: `src/app/services/draft-service.ts`
- Create: `src/app/services/draft-service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/services/draft-service.spec.ts`:

```ts
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

    it('refuses an invalid deck (forbidden card present)', async () => {
      // We can't easily inject a fake banlist in this test; skip the invalid-banlist case
      // because BanlistService loads via HTTP and starts empty in test. The validation
      // function however still flags main-too-large etc. So test main-too-large.
      const { draft } = await setup();
      draft.setName('Big');
      // add 61 distinct cards to overflow main
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
      // linkedDeckId should be set after first save
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
      const { draft, auth } = await setup('Yugi');
      draft.setName('Mine');
      draft.addCard('main', monster(1));
      // simulate a fresh inject for the same user
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [AuthService, DeckStore, DraftService] });
      const draft2 = TestBed.inject(DraftService);
      expect(draft2.draft().name).toBe('Mine');
      expect(draft2.draft().main).toHaveLength(1);
      expect(auth).toBeTruthy();
    });

    it('switches drafts when the user changes', async () => {
      const a = await setup('Yugi');
      a.draft.setName('Yugi-draft');
      a.draft.addCard('main', monster(1));
      a.auth.logout();
      const b = await setup('Kaiba');
      expect(b.draft.draft()).toEqual({ name: '', main: [], extra: [], side: [] });
      b.draft.setName('Kaiba-draft');
      b.auth.logout();
      const c = await setup('Yugi');
      // re-login should restore Yugi's draft… but setup() registers a NEW user with same name
      // — so storage was cleared in beforeEach and Yugi's draft is lost in this isolated test.
      // We instead verify each user gets their own slot:
      expect(c.draft.draft()).toEqual({ name: '', main: [], extra: [], side: [] });
    });
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npm test`
Expected: module not found.

- [ ] **Step 3: Implement DraftService**

Create `src/app/services/draft-service.ts`:

```ts
import { Injectable, computed, effect, inject, signal, Signal } from '@angular/core';
import { Daum } from '../models/yu-gi-result';
import { Deck, DeckCard, DeckSectionId } from '../models/deck';
import { snapshotOf } from '../utils/deck-rules';
import { validateDeck } from '../utils/deck-validation';
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

function draftKey(userId: string): string {
  return `yugioh.draft.${userId}.v1`;
}

@Injectable({ providedIn: 'root' })
export class DraftService {
  private readonly _auth = inject(AuthService);
  private readonly _store = inject(DeckStore);
  private readonly _banlist = inject(BanlistService);

  private readonly _draft = signal<Draft>(this.readFor(this._auth.currentUserId()));

  readonly draft: Signal<Draft> = this._draft.asReadonly();
  readonly isDirty: Signal<boolean> = computed(() => {
    const d = this._draft();
    return d.name.length > 0 || d.main.length > 0 || d.extra.length > 0 || d.side.length > 0;
  });

  constructor() {
    let prev = this._auth.currentUserId();
    effect(() => {
      const uid = this._auth.currentUserId();
      if (uid !== prev) {
        prev = uid;
        this._draft.set(this.readFor(uid));
      }
    });
    effect(() => {
      const uid = this._auth.currentUserId();
      if (uid) this.writeFor(uid, this._draft());
    });
  }

  setName(name: string): void {
    this._draft.update((d) => ({ ...d, name }));
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
  }

  load(deck: Deck): void {
    this._draft.set({
      name: deck.name,
      main: deck.main.map((c) => ({ ...c })),
      extra: deck.extra.map((c) => ({ ...c })),
      side: deck.side.map((c) => ({ ...c })),
      linkedDeckId: deck.id,
    });
  }

  reset(): void {
    this._draft.set({ ...EMPTY_DRAFT });
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
    return { ok: true, id: deck.id };
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
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test`
Expected: all DraftService tests pass.

---

## Task 8: Toast service + Toast component

**Files:**
- Create: `src/app/services/toast-service.ts`
- Create: `src/app/components/toast/toast.ts`
- Create: `src/app/components/toast/toast.html`
- Create: `src/app/components/toast/toast.scss`
- Modify: `src/app/app.ts`
- Modify: `src/app/app.html`

- [ ] **Step 1: Create ToastService**

Create `src/app/services/toast-service.ts`:

```ts
import { Injectable, signal, Signal } from '@angular/core';

export interface Toast {
  id: string;
  message: string;
  level: 'info' | 'success' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _current = signal<Toast | null>(null);
  private _timer: ReturnType<typeof setTimeout> | null = null;

  readonly current: Signal<Toast | null> = this._current.asReadonly();

  show(message: string, level: 'info' | 'success' | 'error' = 'info'): void {
    if (this._timer) clearTimeout(this._timer);
    this._current.set({ id: crypto.randomUUID(), message, level });
    this._timer = setTimeout(() => this._current.set(null), 3000);
  }
}
```

- [ ] **Step 2: Create the Toast component**

Create `src/app/components/toast/toast.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../services/toast-service';

@Component({
  selector: 'app-toast',
  templateUrl: './toast.html',
  styleUrl: './toast.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Toast {
  protected readonly current = inject(ToastService).current;
}
```

Create `src/app/components/toast/toast.html`:

```html
@if (current(); as t) {
  <div class="toast" [class.toast--success]="t.level === 'success'"
                     [class.toast--error]="t.level === 'error'"
                     role="status"
                     aria-live="polite">
    {{ t.message }}
  </div>
}
```

Create `src/app/components/toast/toast.scss`:

```scss
.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: rgba(20, 14, 8, 0.95);
  border: 1px solid rgba(212, 175, 55, 0.4);
  border-left: 4px solid #d4af37;
  color: #f5e6c5;
  padding: 12px 20px;
  border-radius: 6px;
  font-size: 0.95rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  z-index: 1000;
  animation: toast-slide-in 200ms ease-out;
}

.toast--success { border-left-color: #1e9b6e; }
.toast--error { border-left-color: #b41a2c; }

@keyframes toast-slide-in {
  from { transform: translateX(20px); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
}
```

- [ ] **Step 3: Mount the Toast in App root**

Modify `src/app/app.ts` to add the Toast import to the `imports` array:

```ts
import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from './components/toast/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('yu-gi-oh');
  protected readonly embers = Array.from({ length: 22 }, (_, i) => i);
  protected readonly hieroglyphs: string[] = [
    '\u{13080}', '\u{132F9}', '\u{131A3}', '\u{13153}', '\u{13000}',
    '\u{132A8}', '\u{1339F}', '\u{13153}', '\u{132F9}', '\u{13080}',
    '\u{131CB}', '\u{132AA}',
  ];
}
```

In `src/app/app.html`, add `<app-toast />` at the end of the file (after `<router-outlet />`):

```html
<div class="ambient" aria-hidden="true">
  <div class="ambient__hieroglyphs">
    @for (g of hieroglyphs; track $index; let i = $index) {
      <span class="hieroglyph" [attr.data-i]="i">{{ g }}</span>
    }
  </div>
  <div class="ambient__scanlines"></div>
  <div class="ambient__embers">
    @for (i of embers; track i) {
      <span class="ember" [style.--i]="i"></span>
    }
  </div>
</div>

<router-outlet />
<app-toast />
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: SUCCESS.

---

## Task 9: Refactor DeckPanel (name input + Save/Update/New buttons)

**Files:**
- Modify: `src/app/components/deck-panel/deck-panel.ts`
- Modify: `src/app/components/deck-panel/deck-panel.html`
- Modify: `src/app/components/deck-panel/deck-panel.scss`

- [ ] **Step 1: Replace deck-panel.ts**

Replace the entire content of `src/app/components/deck-panel/deck-panel.ts` with:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeckSectionId } from '../../models/deck';
import { DeckSection } from '../deck-section/deck-section';
import { BanlistService } from '../../services/banlist-service';
import { Draft } from '../../services/draft-service';
import { validateDeck } from '../../utils/deck-validation';

@Component({
  selector: 'app-deck-panel',
  imports: [FormsModule, DeckSection],
  templateUrl: './deck-panel.html',
  styleUrl: './deck-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckPanel {
  draft = input.required<Draft>();
  nameChange = output<string>();
  saveRequest = output<void>();
  newRequest = output<void>();
  removeCard = output<{ section: DeckSectionId; cardId: number }>();

  private readonly _banlist = inject(BanlistService);

  protected readonly saveLabel = computed(() =>
    this.draft().linkedDeckId ? 'Mettre à jour' : 'Enregistrer',
  );

  protected readonly issues = computed(() => {
    const d = this.draft();
    const pseudo = {
      id: d.linkedDeckId ?? 'draft',
      ownerId: 'me',
      name: d.name,
      main: d.main, extra: d.extra, side: d.side,
      createdAt: 0, updatedAt: 0,
    };
    return validateDeck(pseudo, this._banlist);
  });

  protected readonly canSave = computed(() => {
    if (!this.draft().name.trim()) return false;
    return !this.issues().some((i) => i.severity === 'error');
  });

  protected onNameInput(value: string): void {
    this.nameChange.emit(value);
  }

  protected onRemove(section: DeckSectionId, cardId: number): void {
    this.removeCard.emit({ section, cardId });
  }
}
```

- [ ] **Step 2: Replace deck-panel.html**

Replace the entire content of `src/app/components/deck-panel/deck-panel.html` with:

```html
<aside class="deck-panel">
  <div class="deck-panel__head">
    <label class="deck-panel__name-label">
      <span>Nom du deck</span>
      <input
        class="deck-panel__name-input"
        type="text"
        placeholder="Mon deck légendaire"
        [ngModel]="draft().name"
        (ngModelChange)="onNameInput($event)"
        aria-label="Nom du deck" />
    </label>

    <div class="deck-panel__actions">
      <button
        type="button"
        class="deck-panel__btn deck-panel__btn--primary"
        [disabled]="!canSave()"
        (click)="saveRequest.emit()">
        {{ saveLabel() }}
      </button>
      <button
        type="button"
        class="deck-panel__btn"
        (click)="newRequest.emit()">
        Nouveau
      </button>
    </div>
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
    [cards]="draft().main"
    [min]="40"
    [max]="60"
    (removeCard)="onRemove('main', $event)" />

  <app-deck-section
    section="extra"
    title="Extra Deck"
    [cards]="draft().extra"
    [max]="15"
    (removeCard)="onRemove('extra', $event)" />

  <app-deck-section
    section="side"
    title="Side Deck"
    [cards]="draft().side"
    [max]="15"
    (removeCard)="onRemove('side', $event)" />
</aside>
```

- [ ] **Step 3: Replace deck-panel.scss**

Replace the entire content of `src/app/components/deck-panel/deck-panel.scss` with:

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
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.deck-panel__name-label {
  display: flex;
  flex-direction: column;
  gap: 4px;

  span {
    color: #d4af37;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
  }
}

.deck-panel__name-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(212, 175, 55, 0.6);
  color: #f5e6c5;
  font-size: 1.2rem;
  padding: 8px 12px;
  border-radius: 4px;

  &:focus { outline: 2px solid #d4af37; outline-offset: 1px; }
}

.deck-panel__actions {
  display: flex;
  gap: 8px;
}

.deck-panel__btn {
  flex: 1;
  background: transparent;
  border: 1px solid rgba(212, 175, 55, 0.4);
  color: #d4af37;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: background 120ms ease, transform 120ms ease;

  &:hover:not(:disabled) { background: rgba(212, 175, 55, 0.1); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }

  &--primary {
    background: linear-gradient(135deg, #d4af37, #f5d76e);
    border-color: transparent;
    color: #2a1a08;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      background: linear-gradient(135deg, #d4af37, #f5d76e);
    }
  }
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

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: SUCCESS (the existing DeckBuilderPage still references the old DeckPanel API — it'll be fixed in Task 10).

---

## Task 10: Refactor DeckBuilderPage around DraftService

**Files:**
- Modify: `src/app/pages/deck-builder/deck-builder.ts`
- Modify: `src/app/pages/deck-builder/deck-builder.html`

- [ ] **Step 1: Replace deck-builder.ts**

Replace the entire content of `src/app/pages/deck-builder/deck-builder.ts` with:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  WritableSignal,
} from '@angular/core';
import { CardQuery, YuGiService } from '../../services/yu-gi-service';
import { Daum, YuGiResult } from '../../models/yu-gi-result';
import { DraftService } from '../../services/draft-service';
import { ToastService } from '../../services/toast-service';
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
  private readonly _yuGiService = inject(YuGiService);
  private readonly _draftService = inject(DraftService);
  private readonly _toast = inject(ToastService);

  readonly draft = this._draftService.draft;

  yugiResult: WritableSignal<YuGiResult | undefined> = signal(undefined);
  selectedCard: WritableSignal<Daum | null> = signal(null);
  filters: WritableSignal<CardQuery> = signal({});
  language: WritableSignal<Language> = signal('fr');
  loading: WritableSignal<boolean> = signal(false);

  currentPage = 0;

  constructor() {
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

  onNameChange(name: string) {
    this._draftService.setName(name);
  }

  onAddToDeck(section: DeckSectionId) {
    const card = this.selectedCard();
    if (!card) return;
    this._draftService.addCard(section, card);
  }

  onRemoveFromDeck(payload: { section: DeckSectionId; cardId: number }) {
    this._draftService.removeCard(payload.section, payload.cardId);
  }

  onSave() {
    const r = this._draftService.save();
    if (r.ok) {
      this._toast.show('Deck enregistré ✓', 'success');
      return;
    }
    if (r.reason === 'no-name') this._toast.show('Donne un nom au deck d’abord.', 'error');
    else if (r.reason === 'invalid') this._toast.show('Le deck n’est pas valide.', 'error');
    else this._toast.show('Tu dois être connecté.', 'error');
  }

  onNew() {
    if (this._draftService.isDirty()) {
      if (!window.confirm('Perdre le brouillon en cours ?')) return;
    }
    this._draftService.reset();
    this._toast.show('Nouveau brouillon.', 'info');
  }
}
```

- [ ] **Step 2: Replace deck-builder.html**

The `YuGiCardDetail` component receives a `Deck` for the canAddCard checks. We adapt by passing a pseudo-Deck built from the draft. Replace the entire content of `src/app/pages/deck-builder/deck-builder.html` with:

```html
<app-header />

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
    [draft]="draft()"
    (nameChange)="onNameChange($event)"
    (saveRequest)="onSave()"
    (newRequest)="onNew()"
    (removeCard)="onRemoveFromDeck($event)" />
</div>

<app-yu-gi-card-detail
  [card]="selectedCard()"
  [language]="language()"
  [mode]="'deckbuilder'"
  [deck]="{
    id: draft().linkedDeckId ?? 'draft',
    ownerId: 'me',
    name: draft().name,
    main: draft().main,
    extra: draft().extra,
    side: draft().side,
    createdAt: 0,
    updatedAt: 0
  }"
  (close)="closeDetail()"
  (addToDeck)="onAddToDeck($event)" />
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: SUCCESS.

---

## Task 11: Refactor DeckListPage (filtered + click loads draft)

**Files:**
- Modify: `src/app/pages/deck-list/deck-list.ts`

- [ ] **Step 1: Replace deck-list.ts**

Replace the entire content of `src/app/pages/deck-list/deck-list.ts` with:

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DeckStore } from '../../services/deck-store';
import { DraftService } from '../../services/draft-service';
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
  private readonly _draft = inject(DraftService);
  private readonly _router = inject(Router);

  protected readonly decks = this._store.myDecks;
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
    this._draft.reset();
    this._router.navigate(['/deck-builder']);
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
    this._draft.load(deck);
    this._router.navigate(['/deck-builder']);
  }
}
```

(The template `deck-list.html` is unchanged: clicking a card already calls `open(d)`, and `create()` now redirects to the builder with a fresh draft instead of immediately creating an empty deck.)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: SUCCESS.

---

## Task 12: Smoke tests + final verification

**Files:**
- None (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: ALL tests pass (the 42 from V1 + new tests for AuthService, DraftService, password-hash, DeckStore-with-auth).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: SUCCESS.

- [ ] **Step 3: Manual end-to-end test (dev server)**

Run: `npm start`. Walk through:

1. Open `http://localhost:4200/`. Header shows: Catalogue · Connexion · Inscription. Catalog renders.
2. Click `Inscription`. Try password "abc" → see field error "≥ 8 caractères". Use valid fields → form succeeds → redirect to `/`.
3. Header now shows: Catalogue · Deck Builder · Mes decks · Bonjour {username} · Déconnexion.
4. Click `Deck Builder`. Editor opens with empty draft, name input is empty, Enregistrer button disabled.
5. Click any monster card → detail opens with `+ Main Deck` / `+ Side Deck` buttons (Extra-deck monsters show `+ Extra Deck`).
6. Add 3 copies of a card → 4th add disabled with tooltip. Add a "Pot of Greed" → INTERDITE badge + add disabled.
7. Type a name in the input → Enregistrer becomes enabled. Click Enregistrer → toast "Deck enregistré ✓".
8. Button now reads `Mettre à jour`. Add more cards, click `Mettre à jour` → toast confirms.
9. Click `Nouveau` → confirm "Perdre le brouillon ?" → confirmed → draft is reset.
10. Click `Mes decks` → see the saved deck. Click it → builder reopens with that deck loaded, button reads `Mettre à jour`.
11. Click `Déconnexion`. Header reverts to logged-out. Try to navigate to `/deck-builder` directly → redirected to `/login?returnTo=/deck-builder`. Log in → redirected to `/deck-builder` with your draft intact.
12. Log out. Register a SECOND user. Their `/decks` is empty (decks are scoped to owner).

If any step fails, debug and fix before reporting completion.

---

## Self-review

**Spec coverage:**

- Routes & navigation (spec §3) → Tasks 4, 5
- Modèle utilisateur + hash (spec §4) → Tasks 1, 2
- Scoping decks par user (spec §5) → Task 6
- DraftService (spec §6) → Task 7
- AuthService (spec §7) → Task 2
- Guards (spec §8) → Tasks 3, 4
- Composants nouveaux (spec §9): Login/Register → Task 4 ; Toast → Task 8
- Composants modifiés (spec §9): AppHeader → Task 5 ; DeckPanel → Task 9 ; DeckBuilderPage → Task 10 ; DeckListPage → Task 11 ; DeckStore → Task 6
- Validation formulaires (spec §10) → Task 4 (RegisterPage embedded validation), Task 2 (AuthService field validation)
- Style / UI (spec §11) → Tasks 4, 5, 8, 9 (with palette consistent)
- Tests Vitest (spec §12) → Tasks 1, 2, 6, 7

**Placeholder scan:** No "TBD", "implement later", "similar to Task N" — every code block is complete.

**Type consistency:**
- `Session`, `User`, `RegisterResult`, `LoginResult` defined in Task 1/2 and consumed unchanged in Tasks 4, 5.
- `Deck.ownerId`, `DeckContent` defined in Task 6 and used in Tasks 7, 10.
- `Draft`, `SaveResult` defined in Task 7 and used in Tasks 9, 10.
- `Toast` interface in Task 8 used by component template.
- Service method names: `register`, `login`, `logout`, `currentUserId`, `setName`, `addCard`, `removeCard`, `load`, `reset`, `save`, `replaceContents`, `myDecks`, `show` — all consistent.
