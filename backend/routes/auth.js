import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { signToken, requireAuth, revokeToken } from '../middleware/auth.js';
import { asyncH } from './_async.js';

const r = Router();

// Standardized auth error so we don't leak whether email exists.
const BAD_CREDS = { error: 'Invalid email or password' };

// A real bcrypt hash compared against when the user doesn't exist, so a
// missing account takes the same time as a wrong password (no user
// enumeration via response timing).
const DUMMY_HASH = bcrypt.hashSync('password-that-will-never-match', 10);

// Throttle credential stuffing / brute force on the login endpoint.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts — please try again later' }
});

r.post('/login', loginLimiter, asyncH(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json(BAD_CREDS);

  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  // Always run one bcrypt compare regardless of whether the user exists.
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json(BAD_CREDS);

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      investorId: user.investorId || null
    }
  });
}));

// Returns the current user from the JWT (used by the frontend on page load
// to validate the stored token and rebuild auth state).
r.get('/me', requireAuth, asyncH(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      investorId: user.investorId || null
    }
  });
}));

// Refresh: rotate to a fresh token and revoke the old one (sliding session).
// Keeps active users logged in while the short access TTL bounds the lifetime
// of a leaked token.
r.post('/refresh', requireAuth, asyncH(async (req, res) => {
  await revokeToken(req.user);
  const token = signToken({
    _id: req.user.id,
    role: req.user.role,
    investorId: req.user.investorId || null
  });
  res.json({ token });
}));

// Logout actually revokes the presented token server-side so a stolen copy
// can't keep being used until natural expiry.
r.post('/logout', requireAuth, asyncH(async (req, res) => {
  await revokeToken(req.user);
  res.json({ ok: true });
}));

export default r;
