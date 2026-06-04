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
