import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Section, StatCard, Cards, Button, Empty, ErrorBanner, Badge } from './ui.jsx';

export default function DemoEnvironment({ refreshKey, onChange }) {
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => api.demo.status().then(setStatus).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [refreshKey]);

  async function run(kind) {
    const verb = kind === 'seed' ? 'seed the demo dataset (this wipes existing business + ledger data first)' : 'reset and clear all business + ledger data';
    if (!window.confirm(`Are you sure you want to ${verb}?`)) return;
    setBusy(kind); setErr(''); setMsg('');
    try {
      const res = kind === 'seed' ? await api.demo.seed() : await api.demo.reset();
      setMsg(kind === 'seed'
        ? `Demo seeded: ${res.counts.investors} investors, ${res.counts.projects} projects, ${res.counts.buyers} buyers, ${res.counts.farmers} farmers.`
        : 'Demo environment reset.');
      await load(); onChange?.();
    } catch (e) { setErr(e.message); }
    setBusy('');
  }

  const allowed = status?.allowed;

  return (
    <Section
      title="Demo Environment"
      subtitle="One-click realistic demo dataset with a consistent investor story."
      action={status && <Badge kind={allowed ? 'paid' : 'cancelled'}>{allowed ? 'Enabled' : 'Disabled'}</Badge>}
    >
      <ErrorBanner>{err}</ErrorBanner>
      {msg && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 mb-3">{msg}</div>}

      {!status ? (
        <Empty>Loading…</Empty>
      ) : !allowed ? (
        <Empty>
          Demo seeding is disabled. Set <code className="mono">ALLOW_DEMO_SEED=true</code> on the server (demo/staging only) to enable one-click seed &amp; reset.
        </Empty>
      ) : (
        <>
          <Cards cols={4}>
            <StatCard label="Investors" value={status.counts.investors} />
            <StatCard label="Projects" value={status.counts.projects} />
            <StatCard label="Buyers" value={status.counts.buyers} />
            <StatCard label="Transactions" value={status.counts.transactions} />
          </Cards>

          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600">
            <div className="font-medium text-slate-800 mb-1">The demo story</div>
            Investor A/B/C invest → Treasury funded → 2 projects allocated → farmers paid →
            harvest &amp; yields recorded → buyers purchase via offtake → revenue received →
            profit distributed (one paid). Internal book-keeping only — no on-chain transfers, so it's instant.
          </div>

          <div className="flex gap-2 mt-4">
            <Button onClick={() => run('seed')} disabled={!!busy}>
              {busy === 'seed' ? 'Seeding…' : 'Seed demo data'}
            </Button>
            <Button variant="danger" onClick={() => run('reset')} disabled={!!busy}>
              {busy === 'reset' ? 'Resetting…' : 'Reset / clear all'}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Both actions are destructive to business + ledger data. Users (logins) and the treasury wallet are preserved.
          </p>
        </>
      )}
    </Section>
  );
}
