import { useEffect, useRef } from 'react';
import { tokenStore } from './api.js';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

/**
 * Subscribe to the /api/events SSE stream while the component is mounted.
 *
 * The token is passed as a query param because the browser's native
 * EventSource cannot set Authorization headers. The stream auto-reconnects
 * via the browser; we re-initialize it if the token changes (e.g. after
 * sign-in) or the component unmounts.
 *
 * @param {(event: object) => void} onEvent - called for every SSE message
 * @param {boolean} [enabled=true] - skip subscribing when false
 */
export function useEventStream(onEvent, enabled = true) {
  const onEventRef = useRef(onEvent);

  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  useEffect(() => {
    if (!enabled) return;
    const token = tokenStore.get();
    if (!token) return;

    const url = `${API_BASE}/api/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    function handle(e) {
      try {
        const data = JSON.parse(e.data);
        onEventRef.current?.(data);
      } catch {
        // Ignore non-JSON frames (e.g. heartbeats arrive as comments and
        // don't fire 'message', but be defensive).
      }
    }

    es.addEventListener('message', handle);
    es.addEventListener('hello', handle);
    es.addEventListener('activity', handle);

    es.onerror = () => {
      // The browser will auto-reconnect with backoff. Nothing to do here
      // beyond letting it happen — we rely on EventSource's built-in retry.
    };

    return () => {
      es.removeEventListener('message', handle);
      es.removeEventListener('hello', handle);
      es.removeEventListener('activity', handle);
      es.close();
    };
  }, [enabled]);
}
