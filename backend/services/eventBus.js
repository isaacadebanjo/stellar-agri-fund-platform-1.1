import { EventEmitter } from 'node:events';

/**
 * In-process pub/sub for SSE clients.
 *
 * Subscribers register a filter (built from their JWT) and a writer fn.
 * Anyone calling broadcast() pushes an event to every subscriber whose
 * filter accepts it.
 *
 * This is intentionally not a Mongo change stream or external broker —
 * the API is a single Node process today. If we ever scale horizontally,
 * swap this module for a Redis pub/sub without changing the call sites.
 */

const emitter = new EventEmitter();
// Allow many concurrent SSE listeners without Node's "MaxListeners" warning.
emitter.setMaxListeners(0);

/**
 * Decide whether a given subscriber should receive an event.
 *
 *   admin    → all events
 *   investor → events tagged with their investorId in metadata.investorIds,
 *              or events the investor themselves caused.
 *   system / other → nothing (defensive default).
 */
function matches(sub, event) {
  if (sub.role === 'admin') return true;
  if (sub.role === 'investor' && sub.investorId) {
    if (event.userId && event.userId === sub.userId) return true;
    const ids = event.metadata?.investorIds;
    if (Array.isArray(ids) && ids.includes(sub.investorId)) return true;
  }
  return false;
}

export function subscribe(sub, onEvent) {
  const handler = (event) => {
    if (matches(sub, event)) onEvent(event);
  };
  emitter.on('event', handler);
  return () => emitter.off('event', handler);
}

export function broadcast(event) {
  // Always include a server timestamp so clients can dedupe / order.
  const payload = { ...event, ts: event.ts || new Date().toISOString() };
  emitter.emit('event', payload);
}

export function subscriberCount() {
  return emitter.listenerCount('event');
}
