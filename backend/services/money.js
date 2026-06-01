// Money helpers. JS floating point makes naive `a + b` and chained
// `+(x).toFixed(2)` drift once you accumulate many amounts (e.g. summing
// hundreds of distributions). These helpers do the arithmetic in integer
// minor units and round half-up deterministically so ledger figures stay
// exact to the cent.
//
// XLM actually has 7 decimals on-chain, but this app presents and stores
// amounts at 2dp; DP is centralized here so it can be widened later without
// hunting down scattered `.toFixed(2)` calls.
export const DP = 2;
const SCALE = 10 ** DP;

// Round a number to DP decimals without binary-float artifacts
// (e.g. 1.005 → 1.01, not 1.00).
export function round(n, dp = DP) {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

// Sum a list (optionally via a selector) with no accumulation drift.
export function sum(items, pick = x => x) {
  const total = items.reduce((acc, item) => acc + Math.round(pick(item) * SCALE), 0);
  return total / SCALE;
}

export const add = (a, b) => (Math.round(a * SCALE) + Math.round(b * SCALE)) / SCALE;
export const sub = (a, b) => (Math.round(a * SCALE) - Math.round(b * SCALE)) / SCALE;

// a * fraction (e.g. share percent), rounded to DP.
export const mul = (a, factor) => round(a * factor);

// `amount` * `percent`% , rounded to DP.
export const pct = (amount, percent) => round((amount * percent) / 100);
