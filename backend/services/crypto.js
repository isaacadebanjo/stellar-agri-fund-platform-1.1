import crypto from 'crypto';

// Envelope encryption for at-rest secrets (Stellar wallet seeds).
//
// Format:  v1:<ivHex>:<authTagHex>:<ciphertextHex>
// Cipher:  AES-256-GCM (authenticated — tampering is detected on decrypt).
// Key:     WALLET_ENC_KEY env var, a 64-char hex string (32 raw bytes).
//          Generate one with:
//            node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// This key MUST be distinct from JWT_SECRET and MUST NOT be committed.
// Rotating it requires re-encrypting existing rows (see scripts/encrypt-wallets.js).

const PREFIX = 'v1';
const ALGO = 'aes-256-gcm';

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;
  const hex = process.env.WALLET_ENC_KEY;
  if (!hex) {
    throw new Error(
      'WALLET_ENC_KEY is not set. Generate one with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('WALLET_ENC_KEY must be a 64-character hex string (32 bytes).');
  }
  cachedKey = Buffer.from(hex, 'hex');
  return cachedKey;
}

// True if the stored value is already in our encrypted envelope format.
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}

// Encrypt plaintext → "v1:iv:tag:ct". Idempotent: an already-encrypted
// value is returned unchanged so setters/migrations can't double-wrap.
export function encryptSecret(plain) {
  if (plain == null) return plain;
  if (isEncrypted(plain)) return plain;
  const iv = crypto.randomBytes(12); // 96-bit nonce, recommended for GCM
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

// Decrypt "v1:iv:tag:ct" → plaintext. Legacy plaintext (rows written before
// encryption shipped) is detected and returned as-is so deploys don't break
// before the migration runs.
export function decryptSecret(stored) {
  if (stored == null) return stored;
  if (!isEncrypted(stored)) return stored; // legacy plaintext — handled by migration
  const [, ivHex, tagHex, ctHex] = stored.split(':');
  if (!ivHex || !tagHex || !ctHex) {
    throw new Error('Malformed encrypted secret envelope');
  }
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctHex, 'hex')),
    decipher.final()
  ]);
  return pt.toString('utf8');
}
