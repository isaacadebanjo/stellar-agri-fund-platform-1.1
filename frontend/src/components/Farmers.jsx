import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Section, Button, Input, Field, TableWrap, Empty, ErrorBanner, Money
} from './ui.jsx';

export default function Farmers({ refreshKey, onChange }) {
  const [farmers, setFarmers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('');
  const [assignedProjects, setAssignedProjects] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([api.farmers.list(), api.projects.list()])
    .then(([f, p]) => { setFarmers(f); setProjects(p); })
    .catch(e => setErr(e.message));
  useEffect(() => { load(); }, [refreshKey]);

  function toggleProject(id) {
    setAssignedProjects(curr =>
      curr.includes(id) ? curr.filter(x => x !== id) : [...curr, id]
    );
  }

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.farmers.create({ name: name.trim(), assignedProjects });
      setName(''); setAssignedProjects([]); setErr('');
      await load(); onChange?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <>
      <Section title="Add Farmer" subtitle="Registers a payout recipient + auto-creates a funded Stellar testnet wallet to receive on-chain payouts">
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <Field label="Farmer name">
              <Input placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required />
            </Field>
          </div>
          <Field label="Assign projects">
            {projects.length === 0 ? (
              <span className="text-xs text-slate-500">No projects yet.</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {projects.map(p => {
                  const on = assignedProjects.includes(p.id);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => toggleProject(p.id)}
                      className={
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ' +
                        (on
                          ? 'bg-brand-50 border-brand-200 text-brand-800'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50')
                      }
                    >
                      <span className={'h-1.5 w-1.5 rounded-full ' + (on ? 'bg-brand-600' : 'bg-slate-300')} />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
          <div className="flex items-center justify-end">
            <Button disabled={busy}>{busy ? 'Creating wallet on testnet…' : 'Create farmer'}</Button>
          </div>
          <ErrorBanner>{err}</ErrorBanner>
        </form>
      </Section>

      <Section title="Farmers" subtitle={`${farmers.length} total`}>
        {farmers.length === 0 ? (
          <Empty>No farmers yet.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Wallet (Stellar pubkey)</th>
                  <th className="!text-right">Balance</th>
                  <th>Projects</th>
                  <th className="!text-right">Payouts</th>
                  <th className="!text-right">Total received</th>
                </tr>
              </thead>
              <tbody>
                {farmers.map(f => (
                  <tr key={f.id}>
                    <td className="font-medium text-slate-900">{f.name}</td>
                    <td className="mono truncate max-w-[260px]">{f.publicKey || '—'}</td>
                    <td className="text-right"><Money value={f.balance} /></td>
                    <td>
                      {f.projects.length === 0
                        ? <span className="text-slate-400">—</span>
                        : (
                          <div className="flex flex-wrap gap-1">
                            {f.projects.map(p => (
                              <span key={p.id} className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 ring-1 ring-slate-200">
                                {p.name}
                              </span>
                            ))}
                          </div>
                        )}
                    </td>
                    <td className="text-right tabular-nums">{f.payoutCount}</td>
                    <td className="text-right"><Money value={f.totalReceived} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>
    </>
  );
}
