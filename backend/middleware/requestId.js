import crypto from 'crypto';

// Attach a request id to every request for log correlation. Honors an inbound
// `X-Request-Id` (e.g. from a proxy/load balancer) when present, otherwise
// generates one. Echoed back in the `X-Request-Id` response header so a client
// or operator can tie a response to its server-side logs.
export function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  req.id = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
