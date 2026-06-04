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
