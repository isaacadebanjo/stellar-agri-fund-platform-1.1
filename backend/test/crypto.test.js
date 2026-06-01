import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, isEncrypted } from '../services/crypto.js';

const SEED = 'SBSECRETSEEDEXAMPLEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('crypto envelope', () => {
  it('round-trips a secret', () => {
    const enc = encryptSecret(SEED);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain(SEED);
    expect(decryptSecret(enc)).toBe(SEED);
  });

  it('is idempotent (never double-wraps)', () => {
    const once = encryptSecret(SEED);
    expect(encryptSecret(once)).toBe(once);
  });

  it('uses a unique IV per call', () => {
    expect(encryptSecret(SEED)).not.toBe(encryptSecret(SEED));
  });

  it('passes through legacy plaintext (pre-migration rows)', () => {
    expect(isEncrypted(SEED)).toBe(false);
    expect(decryptSecret(SEED)).toBe(SEED);
  });

  it('detects tampering via the GCM auth tag', () => {
    expect(() => decryptSecret('v1:00:00:00')).toThrow();
  });

  it('handles null/undefined without throwing', () => {
    expect(encryptSecret(null)).toBe(null);
    expect(decryptSecret(undefined)).toBe(undefined);
  });
});
