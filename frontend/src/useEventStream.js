import { useEffect, useRef } from 'react';
import { api } from './api.js';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

/**
 * Subscribe to the /api/events SSE stream while the component is mounted.
 *
 * EventSource can't send Authorization headers, so the connection is
 * authenticated with a short-lived (60s) single-purpose ticket fetched from
 * /api/events/ticket. Because EventSource auto-reconnect would reuse a stale
 * (expired) ticket, we manage reconnection ourselves and fetch a fresh ticket
 * for every (re)connection.
 *
 * @param {(event: object) => void} onEvent - called for every SSE message
 * @param {boolean} [enabled=true] - skip subscribing when false
 */
export function useEventStream(onEvent, enabled = true) {
  const onEventRef = useRef(onEvent);

  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  useEffect(() => {
    if (!enabled) return;

    let es = null;
    let cancelled = false;
    let retryTimer = null;

    function handle(e) {
      try {
        const data = JSON.parse(e.data);
        onEventRef.current?.(data);
      } catch {
        // Ignore non-JSON frames (heartbeats arrive as comments).
      }
    }

    function scheduleReconnect(delay) {
      if (cancelled) return;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, delay);
    }

    async function connect() {
      if (cancelled) return;
      let ticket;
      try {
        ({ ticket } = await api.events.ticket());
      } catch {
        // Not authenticated yet / transient failure — back off and retry.
        return scheduleReconnect(5000);
      }
      if (cancelled || !ticket) return;

      es = new EventSource(`${API_BASE}/api/events?ticket=${encodeURIComponent(ticket)}`);
      es.addEventListener('message', handle);
      es.addEventListener('hello', handle);
      es.addEventListener('activity', handle);
      es.addEventListener('notification', handle);
      es.onerror = () => {
        // Likely an expired ticket — rebuild with a fresh one.
        es?.close();
        scheduleReconnect(3000);
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      if (es) {
        es.removeEventListener('message', handle);
        es.removeEventListener('hello', handle);
        es.removeEventListener('activity', handle);
        es.removeEventListener('notification', handle);
        es.close();
      }
    };
  }, [enabled]);
}
