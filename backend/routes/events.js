import express from 'express';
import { requireAuth, signStreamTicket, verifyStreamTicket } from '../middleware/auth.js';
import { asyncH } from './_async.js';
import { subscribe } from '../services/eventBus.js';

const router = express.Router();

/**
 * GET /api/events/ticket  (authenticated)
 *
 * Issues a 60-second, single-purpose ticket. The browser puts THIS in the
 * EventSource URL — never the long-lived session token — so a token in a
 * proxy/access log is at worst a 1-minute, stream-only credential.
 */
router.get('/ticket', requireAuth, (req, res) => {
  res.json({ ticket: signStreamTicket(req.user) });
});

/**
 * GET /api/events?ticket=<jwt>
 *
 * Server-Sent Events stream, authenticated by the short-lived ticket above.
 */
router.get('/', asyncH(async (req, res) => {
  const ticket = req.query.ticket;
  if (!ticket) return res.status(401).json({ error: 'Authentication required' });

  let user;
  try {
    user = await verifyStreamTicket(ticket);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired stream ticket' });
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
}));

export default router;
