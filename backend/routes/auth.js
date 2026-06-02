import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import Investor from '../models/Investor.js';
import { signToken, requireAuth, revokeToken } from '../middleware/auth.js';
import { walletAuthLimiter } from '../middleware/rateLimit.js';
import { isWalletAuthEnabled, buildChallenge, verifyChallenge, WALLET_NETWORK } from '../services/sep10.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';
import { asyncH } from './_async.js';

const r = Router();

// Standardized auth error so we don't leak whether email exists.
const BAD_CREDS = { error: 'Invalid email or password' };

// Single source of truth for the user object returned to the client, so the
// password, wallet and /me paths all expose the same shape.
function authUser(user) {
  return {
    id: user._id,
    email: user.email,
    role: user.role,
    investorId: user.investorId || null,
    authType: user.authType || 'password',
    stellarPublicKey: user.walletPublicKey || null
  };
}

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

  logActivity({
    userId: user._id.toString(),
    userRole: user.role,
    actionType: ActivityTypes.LOGIN,
    entityType: EntityTypes.SYSTEM,
    entityId: user._id.toString(),
    description: `User ${user.email} logged in`,
    status: ActivityStatus.SUCCESS,
    metadata: { email: user.email, authType: 'password' }
  });

  res.json({ token, user: authUser(user) });
}));

// Returns the current user from the JWT (used by the frontend on page load
// to validate the stored token and rebuild auth state).
r.get('/me', requireAuth, asyncH(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ user: authUser(user) });
}));

// ---------------------------------------------------------------------------
// Non-custodial wallet login (SEP-10, testnet). Reachable without a session;
// these are mounted before the global requireAuth in server.js.
// ---------------------------------------------------------------------------

// Step 1: hand the wallet a challenge transaction to sign. `account` is the
// connected Stellar public key (G...).
r.get('/wallet/challenge', walletAuthLimiter, asyncH(async (req, res) => {
  if (!isWalletAuthEnabled()) {
    return res.status(503).json({ error: 'Wallet login is not enabled on this server.' });
  }
  const account = String(req.query.account || '').trim();
  if (!account) return res.status(400).json({ error: 'account (public key) is required' });

  let transaction;
  try {
    transaction = buildChallenge(account);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json({ transaction, network: 'testnet', network_passphrase: WALLET_NETWORK });
}));

// Step 2: verify the signed challenge, then find-or-create the investor + a
// linked investor user, and issue the same JWT the password flow returns.
r.post('/wallet/verify', walletAuthLimiter, asyncH(async (req, res) => {
  if (!isWalletAuthEnabled()) {
    return res.status(503).json({ error: 'Wallet login is not enabled on this server.' });
  }
  const signedXdr = req.body?.transaction;
  if (!signedXdr) return res.status(400).json({ error: 'transaction (signed challenge) is required' });

  let publicKey;
  try {
    publicKey = verifyChallenge(signedXdr);
  } catch {
    return res.status(401).json({ error: 'Wallet signature verification failed' });
  }

  // Find-or-create the non-custodial investor for this wallet.
  let investor = await Investor.findOne({ stellarPublicKey: publicKey });
  if (!investor) {
    investor = await Investor.create({
      name: `Wallet ${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`,
      custodial: false,
      stellarPublicKey: publicKey
    });
  }

  // Find-or-create the investor user. Wallet users never password-login, so
  // the synthetic email/hash exist only to satisfy the shared User schema and
  // reuse the existing session/refresh/SSE plumbing.
  let user = await User.findOne({ walletPublicKey: publicKey });
  if (!user) {
    user = await User.create({
      email: `${publicKey.toLowerCase()}@wallet.stellar`,
      passwordHash: bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10),
      role: 'investor',
      investorId: investor._id,
      authType: 'wallet',
      walletPublicKey: publicKey
    });
  }

  const token = signToken(user);

  logActivity({
    userId: user._id.toString(),
    userRole: user.role,
    actionType: ActivityTypes.LOGIN,
    entityType: EntityTypes.SYSTEM,
    entityId: user._id.toString(),
    description: `Wallet ${publicKey.slice(0, 4)}…${publicKey.slice(-4)} logged in`,
    status: ActivityStatus.SUCCESS,
    metadata: { authType: 'wallet', stellarPublicKey: publicKey }
  });

  res.json({ token, user: authUser(user) });
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

  logActivity({
    userId: req.user.id,
    userRole: req.user.role,
    actionType: ActivityTypes.LOGOUT,
    entityType: EntityTypes.SYSTEM,
    entityId: req.user.id,
    description: 'User logged out',
    status: ActivityStatus.SUCCESS
  });

  res.json({ ok: true });
}));

export default r;
