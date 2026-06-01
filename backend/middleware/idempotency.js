import IdempotencyKey from '../models/IdempotencyKey.js';

// Per-route idempotency guard for money-moving endpoints.
//
// Behaviour:
//  - No `Idempotency-Key` header  → proceed normally (header is optional, but
//    the frontend sends one for every financial mutation).
//  - First request with a key     → reserve the key, run the handler, then
//    cache a 2xx response so a replay returns it verbatim.
//  - Replay after completion      → return the cached status + body; the
//    handler (and any Stellar transfer) never runs again.
//  - Replay while still in flight → 409, so a double-click can't double-spend.
//  - Non-2xx response             → reservation is released so the client can
//    legitimately retry a failed request.
export function idempotent(scope) {
  return async function idempotencyMiddleware(req, res, next) {
    const key = req.get('Idempotency-Key');
    if (!key) return next();

    const id = `${scope}:${key}`;
    try {
      await IdempotencyKey.create({ _id: id, scope });
    } catch (e) {
      if (e?.code === 11000) {
        const existing = await IdempotencyKey.findById(id).lean();
        if (existing?.status === 'completed') {
          return res.status(existing.statusCode || 200).json(existing.response);
        }
        return res
          .status(409)
          .json({ error: 'A request with this Idempotency-Key is already in progress' });
      }
      return next(e);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      if (ok) {
        IdempotencyKey.findByIdAndUpdate(id, {
          status: 'completed',
          statusCode: res.statusCode,
          response: body
        }).catch(() => {});
      } else {
        // Failed attempt — drop the reservation so a retry can run.
        IdempotencyKey.findByIdAndDelete(id).catch(() => {});
      }
      return originalJson(body);
    };

    // If the response never goes through res.json (thrown error handled
    // elsewhere, dropped connection), release the reservation.
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) return;
      IdempotencyKey.findByIdAndDelete(id).catch(() => {});
    });

    next();
  };
}
