import jwt from 'jsonwebtoken';

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}

export function signToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, investorId: user.investorId || null },
    getSecret(),
    { expiresIn: '7d' }
  );
}

// Verify Authorization: Bearer <token> and attach req.user.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, getSecret());
    next();
  } catch (e) {
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
