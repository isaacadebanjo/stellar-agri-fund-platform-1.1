import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import RevokedToken from '../models/RevokedToken.js';

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}

// Access-token lifetime. Shorter than the old 7d to bound the damage of a
// stolen token; the frontend rolls it via /auth/refresh while active.
const ACCESS_TTL = process.env.JWT_EXPIRES_IN || '1d';

export function signToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      investorId: user.investorId || null,
      jti: crypto.randomUUID()
    },
    getSecret(),
    { expiresIn: ACCESS_TTL }
  );
}

// Short-lived, single-purpose ticket for the SSE stream. The browser's
// EventSource can't send an Authorization header, so this (not the long-lived
// session token) is what goes in the URL — minimal lifetime, minimal blast
// radius if it lands in a log.
export function signStreamTicket(user) {
  return jwt.sign(
    {
      id: user._id || user.id,
      role: user.role,
      investorId: user.investorId || null,
      purpose: 'sse',
      jti: crypto.randomUUID()
    },
    getSecret(),
    { expiresIn: '60s' }
  );
}

export async function verifyStreamTicket(token) {
  const payload = await verifyToken(token);
  if (payload.purpose !== 'sse') throw new Error('Not a stream ticket');
  return payload;
}

// Verify signature/expiry AND check the jti hasn't been revoked (logout /
// refresh rotation). Throws on any failure. Shared by requireAuth and the
// SSE endpoint so revocation is enforced everywhere.
export async function verifyToken(token) {
  const payload = jwt.verify(token, getSecret());
  if (payload.jti && (await RevokedToken.exists({ _id: payload.jti }))) {
    throw new Error('Token has been revoked');
  }
  return payload;
}

// Add a token's jti to the revocation list until it would naturally expire.
export async function revokeToken(payload) {
  if (!payload?.jti || !payload?.exp) return;
  await RevokedToken.updateOne(
    { _id: payload.jti },
    { $setOnInsert: { expiresAt: new Date(payload.exp * 1000) } },
    { upsert: true }
  );
}

// Verify Authorization: Bearer <token> and attach req.user.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = await verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Restrict to one or more roles. Use after requireAuth.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// Allow if admin OR if the request is for the user's own investorId.
// Caller specifies how to extract the target id from the request.
export function requireSelfOrAdmin(getTargetInvestorId) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role === 'admin') return next();
    const target = getTargetInvestorId(req);
    if (req.user.role === 'investor' && req.user.investorId && req.user.investorId === target) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden' });
  };
}
