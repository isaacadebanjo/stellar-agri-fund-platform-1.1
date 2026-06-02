// Lightweight request validation for money/ops routes.
//
// These helpers throw a `BadRequest` (httpStatus 400) on invalid input; the
// central error handler in server.js turns that into `{ error: '...' }` with a
// 400 status, matching the existing inline `res.status(400).json(...)` shape.
// Routes call them at the top of a handler, e.g.
//   const value = amount(req.body?.amount);
// so the parsed/normalized value is returned ready to use.

export class BadRequest extends Error {
  constructor(message) {
    super(message);
    this.name = 'BadRequest';
    this.httpStatus = 400;
  }
}

// A strictly positive, finite money amount. Rejects NaN, Infinity, strings that
// don't parse, zero and negatives. Returns the parsed Number.
export function amount(value, field = 'amount') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new BadRequest(`${field} must be a positive number`);
  }
  return n;
}

// Platform fee percent in [0, 100]. Falls back to `def` when omitted/blank.
export function feePercent(value, def = 10) {
  const raw = value === undefined || value === null || value === '' ? def : value;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new BadRequest('platformFeePercent must be between 0 and 100');
  }
  return n;
}

// A required, non-empty id (Mongo string _id in this app). Returns the trimmed id.
export function id(value, field = 'id') {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequest(`${field} is required`);
  }
  return value.trim();
}

// A required, non-empty string.
export function nonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequest(`${field} is required`);
  }
  return value.trim();
}

// An optional ISO date. Returns a normalized Date (time stripped to UTC
// midnight) or undefined when omitted. Throws if provided but unparseable.
export function optionalIsoDate(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequest(`${field} must be a valid ISO date`);
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
