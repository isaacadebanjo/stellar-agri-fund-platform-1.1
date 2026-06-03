import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Section, Input, Select, Field, Empty, ErrorBanner, Badge } from './ui.jsx';
import {
  IconArrowUp, IconArrowDown, IconShare, IconLeaf, IconTractor, IconReport,
  IconList, IconUser, IconAudit
} from './icons.jsx';

// The capital lifecycle, in order, so the timeline reads as a story:
// funded → allocated → paid → harvest → revenue → distribution → investor paid.
const META = {
  INVESTMENT:             { label: 'Investor Funded Treasury', icon: IconArrowUp,   color: 'bg-blue-500',    ring: 'ring-blue-200' },
  ALLOCATION:             { label: 'Capital Allocated',        icon: IconShare,     color: 'bg-amber-500',   ring: 'ring-amber-200' },
  PAYOUT:                 { label: 'Farmer Paid',              icon: IconArrowDown, color: 'bg-orange-500',  ring: 'ring-orange-200' },
  RECORD_YIELD:           { label: 'Harvest Recorded',         icon: IconLeaf,      color: 'bg-emerald-500', ring: 'ring-emerald-200' },
  CREATE_FARM_VISIT:      { label: 'Farm Inspected',           icon: IconTractor,   color: 'bg-lime-600',    ring: 'ring-lime-200' },
  REVENUE_ENTRY:          { label: 'Revenue Received',         icon: IconArrowUp,   color: 'bg-cyan-500',    ring: 'ring-cyan-200' },
  DISTRIBUTION_GENERATED: { label: 'Distribution Generated',   icon: IconReport,    color: 'bg-violet-500',  ring: 'ring-violet-200' },
  DISTRIBUTION_PAID:      { label: 'Investor Paid',            icon: IconUser,      color: 'bg-indigo-600',  ring: 'ring-indigo-200' },
  MILESTONE_APPROVED:     { label: 'Milestone Approved',       icon: IconList,      color: 'bg-teal-500',    ring: 'ring-teal-200' },
  APPROVAL_SUBMITTED:     { label: 'Approval Requested',       icon: IconAudit,     color: 'bg-rose-500',    ring: 'ring-rose-200' }
};
const DEFAULT_META = { label: 'Activity', icon: IconList, color: 'bg-slate-400', ring: 'ring-slate-200' };

// Lifecycle filter presets.
const PRESETS = [
  { id: 'lifecycle', label: 'Capital Lifecycle', types: ['INVESTMENT', 'ALLOCATION', 'PAYOUT', 'REVENUE_ENTRY', 'DISTRIBUTION_GENERATED', 'DISTRIBUTION_PAID'] },
  { id: 'operations', label: 'Operations', types: ['PAYOUT', 'RECORD_YIELD', 'CREATE_FARM_VISIT', 'REVENUE_ENTRY'] },
  { id: 'governance', label: 'Governance', types: ['APPROVAL_SUBMITTED', 'MILESTONE_APPROVED', 'DISTRIBUTION_GENERATED'] },
  { id: 'all', label: 'Everything', types: [] }
];

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

export default function Timeline({ refreshKey }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [preset, setPreset] = useState('lifecycle');
  const [search, setSearch] = useState('');

  const types = PRESETS.find(p => p.id === preset)?.types || [];

  useEffect(() => {
    setLoading(true);
    const params = { limit: 200 };
    if (types.length) params.actionType = types.join(',');
    api.activity.list(params)
      .then(d => { setLogs(d.data || []); setErr(''); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [refreshKey, preset]); // eslint-disable-line react-hooks/exhaustive-deps

  // Client-side free-text search over description + action type.
  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.trim().toLowerCase();
    return logs.filter(l =>
      (l.description || '').toLowerCase().includes(q) ||
      (l.actionType || '').toLowerCase().includes(q));
  }, [logs, search]);

  // Group chronologically by calendar day.
  const groups = useMemo(() => {
    const byDay = new Map();
    for (const l of filtered) {
      const key = new Date(l.createdAt).toDateString();
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(l);
    }
    return [...byDay.entries()].map(([, items]) => ({ label: dayLabel(items[0].createdAt), items }));
  }, [filtered]);

  return (
    <Section
      title="Activity Timeline"
      subtitle="The capital lifecycle and operational events, in order."
      action={
        <div className="flex flex-wrap gap-2 items-end">
          <Field label="View">
            <Select value={preset} onChange={e => setPreset(e.target.value)}>
              {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="Search">
            <Input placeholder="Filter events…" value={search} onChange={e => setSearch(e.target.value)} />
          </Field>
        </div>
      }
    >
      <ErrorBanner>{err}</ErrorBanner>
      {loading && logs.length === 0 ? (
        <Empty>Loading…</Empty>
      ) : groups.length === 0 ? (
        <Empty>No events match this view.</Empty>
      ) : (
        <div className="space-y-8">
          {groups.map((g, gi) => (
            <div key={gi}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">{g.label}</div>
              <ol className="relative border-l-2 border-slate-100 ml-3 space-y-5">
                {g.items.map(l => {
                  const m = META[l.actionType] || DEFAULT_META;
                  const Icon = m.icon;
                  return (
                    <li key={l.id} className="ml-6">
                      <span className={`absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full ${m.color} ring-4 ring-white shadow-sm`}>
                        <Icon className="h-3.5 w-3.5 text-white" />
                      </span>
                      <div className={`card p-3 ring-1 ring-inset ${m.ring}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900">{m.label}</span>
                          <span className="text-[11px] text-slate-400 whitespace-nowrap">
                            {new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{l.description}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {l.status && l.status !== 'SUCCESS' && (
                            <Badge kind={l.status === 'FAILED' ? 'cancelled' : 'pending'}>{l.status.toLowerCase()}</Badge>
                          )}
                          {l.txHash && !l.txHash.startsWith('internal_') && (
                            <a
                              href={`https://stellar.expert/explorer/testnet/tx/${l.txHash}`}
                              target="_blank" rel="noopener noreferrer"
                              className="font-mono text-[11px] text-blue-600 hover:text-blue-800 underline"
                            >
                              {l.txHash.slice(0, 12)}…
                            </a>
                          )}
                          <span className="text-[10px] uppercase tracking-wider text-slate-400">{l.userRole}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
