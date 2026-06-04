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
