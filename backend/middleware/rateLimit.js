import rateLimit from 'express-rate-limit';

// Shared rate limiters for sensitive endpoints. `trust proxy` is set in
// server.js so req.ip is the real client behind Render's proxy.

const common = {
  standardHeaders: true,
  legacyHeaders: false
};

// Money-moving endpoints (invest, allocate, fund, payouts, distribution
// generate/pay). Caps how fast a single client can trigger value transfers —
// idempotency already stops accidental double-submits; this bounds abuse and
// runaway scripts. Generous enough for normal admin operation.
export const moneyLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  max: Number(process.env.MONEY_RATE_LIMIT_MAX) || 30,
  message: { error: 'Too many financial operations — please slow down and retry shortly' }
});

// Wallet auth (SEP-10 challenge + verify). Throttles attempts to mint sessions
// from wallet signatures.
export const walletAuthLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.WALLET_AUTH_RATE_LIMIT_MAX) || 20,
  message: { error: 'Too many wallet authentication attempts — please try again later' }
});
