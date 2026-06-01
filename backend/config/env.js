// Fail-fast environment validation.
//
// Runs once at startup so a misconfigured deploy dies immediately with a clear
// message — instead of booting and then throwing deep inside a request (e.g.
// when crypto.js first needs WALLET_ENC_KEY, or seed.js needs ADMIN_PASSWORD).
//
// The app reads ALL secrets from process.env. A local backend/.env is a
// developer convenience only (loaded via `dotenv/config`); nothing here
// requires a .env file to exist at runtime — Render/Vercel inject real env vars.

const HEX_64 = /^[0-9a-fA-F]{64}$/;

export function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  // Always required (every environment) — the app cannot function without these.
  if (!process.env.MONGODB_URI) {
    errors.push('MONGODB_URI is required (MongoDB Atlas connection string).');
  }
  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET is required (long random string used to sign JWTs).');
  }
  if (!process.env.WALLET_ENC_KEY) {
    errors.push('WALLET_ENC_KEY is required (64-char hex / 32 bytes, AES-256 key).');
  } else if (!HEX_64.test(process.env.WALLET_ENC_KEY)) {
    errors.push('WALLET_ENC_KEY must be a 64-character hex string (32 bytes).');
  }
  if (
    process.env.JWT_SECRET &&
    process.env.WALLET_ENC_KEY &&
    process.env.JWT_SECRET === process.env.WALLET_ENC_KEY
  ) {
    errors.push('WALLET_ENC_KEY must be different from JWT_SECRET.');
  }

  // Production-only requirements.
  if (isProd) {
    if (!process.env.ADMIN_PASSWORD) {
      errors.push('ADMIN_PASSWORD is required in production (seeds the admin login).');
    }
    if (!process.env.CORS_ORIGIN) {
      warnings.push(
        'CORS_ORIGIN is not set — all cross-origin (browser) requests will be rejected. ' +
          'Set it to your Vercel frontend origin(s).'
      );
    }
  }

  // Optional non-custodial wallet login (SEP-10). If the signing secret is set,
  // it must be a structurally valid Stellar secret seed (S..., base32, len 56).
  const sep10 = process.env.SEP10_SERVER_SECRET;
  if (sep10 && !/^S[A-Z2-7]{55}$/.test(sep10)) {
    errors.push('SEP10_SERVER_SECRET must be a valid Stellar secret seed (S...).');
  }

  // The app is testnet-only. Surface a mainnet Horizon misconfig as an error
  // here too (stellar.js also hard-blocks it at import time).
  const horizon = process.env.STELLAR_HORIZON_URL;
  if (horizon) {
    try {
      const host = new URL(horizon).host.toLowerCase();
      if (host === 'horizon.stellar.org' || host.includes('pubnet')) {
        errors.push(`STELLAR_HORIZON_URL points at Stellar mainnet (${host}); this app is testnet-only.`);
      }
    } catch {
      errors.push(`STELLAR_HORIZON_URL is not a valid URL: ${horizon}`);
    }
  }

  for (const w of warnings) console.warn(`[env] WARNING: ${w}`);

  if (errors.length) {
    console.error('[env] Invalid configuration:\n  - ' + errors.join('\n  - '));
    throw new Error(`Environment validation failed (${errors.length} error(s)). See logs above.`);
  }

  console.log(`[env] configuration OK (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
}
