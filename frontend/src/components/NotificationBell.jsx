import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { IconBell } from './icons.jsx';

const levelDot = (l) => (l === 'warning' ? 'bg-amber-500' : l === 'success' ? 'bg-emerald-500' : 'bg-sky-500');

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// In-app notification center: a header bell with an unread badge and a dropdown
// listing recent notifications + history. `liveTick` changes whenever a
// 'notification' SSE event arrives (wired in App), prompting a refresh.
export default function NotificationBell({ liveTick }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const refreshCount = () =>
    api.notifications.unreadCount().then(d => setUnread(d.unread || 0)).catch(() => {});

  function loadList() {
    setLoading(true);
    api.notifications.list({ limit: 30 })
      .then(d => setItems(d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  // Initial + live refresh of the badge count.
  useEffect(() => { refreshCount(); }, [liveTick]);
  // Refresh the open list when a new notification arrives.
  useEffect(() => { if (open) loadList(); }, [liveTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click.
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  }

  async function markRead(id) {
    try {
      await api.notifications.markRead(id);
      setItems(items.map(n => (n.id === id ? { ...n, read: true } : n)));
      refreshCount();
    } catch { /* ignore */ }
  }

  async function markAll() {
    try {
      await api.notifications.markAllRead();
      setItems(items.map(n => ({ ...n, read: true })));
      setUnread(0);
    } catch { /* ignore */ }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label="Notifications"
        className="btn-ghost !p-2 relative"
        onClick={toggle}
      >
        <IconBell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[28rem] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-pop z-50">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 sticky top-0 bg-white">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-[11px] font-medium text-brand-700 hover:text-brand-900">
                Mark all read
              </button>
            )}
          </div>

          {loading && items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">No notifications yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map(n => (
                <li
                  key={n.id}
                  onClick={() => !n.read && markRead(n.id)}
                  className={'px-4 py-3 cursor-pointer hover:bg-slate-50 ' + (n.read ? '' : 'bg-sky-50/40')}
                >
                  <div className="flex items-start gap-2">
                    <span className={'mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ' + (n.read ? 'bg-slate-300' : levelDot(n.level))} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 truncate">{n.title}</span>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
