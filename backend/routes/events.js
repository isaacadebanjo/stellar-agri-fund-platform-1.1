import express from 'express';
import jwt from 'jsonwebtoken';
import { subscribe } from '../services/eventBus.js';

const router = express.Router();

/**
 * GET /api/events
 *
 * Server-Sent Events stream. The browser's native EventSource cannot set
 * Authorization headers, so the JWT is passed via query string. Acceptable
 * trade-off: in production this is HTTPS, the token is short-lived (7d), and
 * we never accept the same token for write paths through this endpoint.
 */
router.get('/', (req, res) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'JWT_SECRET not set' });

  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  let user;
  try {
    user = jwt.verify(token, secret);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // SSE headers.
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Disable buffering on common reverse proxies (nginx, render, etc).
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();

  function send(event) {
    // Each SSE frame: optional "event:" line, then "data:" lines, blank line.
    res.write(`event: ${event.type || 'message'}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  // Hello frame so the client knows the stream is alive.
  send({ type: 'hello', ts: new Date().toISOString() });

  // Heartbeat every 25s — keeps proxies and mobile networks from killing
  // the connection during quiet periods.
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25_000);

  const sub = {
    userId: user.id,
    role: user.role,
    investorId: user.investorId || null
  };
  const unsubscribe = subscribe(sub, send);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

export default router;
