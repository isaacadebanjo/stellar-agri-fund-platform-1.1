import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { asyncH } from './_async.js';

const r = Router();

// Standardized auth error so we don't leak whether email exists.
const BAD_CREDS = { error: 'Invalid email or password' };

r.post('/login', asyncH(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json(BAD_CREDS);

  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (!user) return res.status(401).json(BAD_CREDS);

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json(BAD_CREDS);

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

// Logout is a no-op server-side (stateless JWT) — the client just discards
// the token. Endpoint exists so the frontend can call /auth/logout uniformly.
r.post('/logout', (req, res) => {
  res.json({ ok: true });
});

export default r;
