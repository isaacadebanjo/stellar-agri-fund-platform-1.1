import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Section, StatCard, Cards, Button, Input, Select, Field, TableWrap, Empty, ErrorBanner, fmt
} from './ui.jsx';

const STATUSES = ['active', 'inactive'];
const VERIFY = ['unverified', 'pending', 'verified'];
const EMPTY = { name: '', company: '', contactPerson: '', email: '', phone: '', country: '', notes: '' };

export default function Buyers({ refreshKey, onChange }) {
  const [buyers, setBuyers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([api.buyers.list(), api.buyers.summary()])
    .then(([b, s]) => { setBuyers(b); setSummary(s); })
    .catch(e => setErr(e.message));
  useEffect(() => { load(); }, [refreshKey]);

  async function add(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await api.buyers.create(form);
      setForm(EMPTY); setErr('');
      await load(); onChange?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function patch(id, data) {
    try { await api.buyers.update(id, data); await load(); onChange?.(); } catch (e) { setErr(e.message); }
  }
  async function archive(id) {
    try { await api.buyers.archive(id); await load(); onChange?.(); } catch (e) { setErr(e.message); }
  }

  return (
    <>
      {summary && (
        <Cards cols={3}>
          <StatCard label="Active Buyers" value={summary.activeBuyers} sub={`${summary.totalBuyers} total`} />
          <StatCard label="Verified Buyers" value={summary.verifiedBuyers} sub="due-diligence passed" />
          <StatCard label="Contracted Volume" value={summary.totalContractedVolume.toLocaleString()} sub={`${fmt(summary.totalContractedValue)} contract value`} />
        </Cards>
      )}

      <Section title="Add Buyer" subtitle="Register an offtake buyer for due diligence">
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Name"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Company"><Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label="Contact person"><Input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Country"><Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></Field>
          </div>
          <Field label="Notes"><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="flex justify-end"><Button disabled={busy}>{busy ? 'Adding…' : 'Add buyer'}</Button></div>
          <ErrorBanner>{err}</ErrorBanner>
        </form>
      </Section>

      <Section title="Buyers" subtitle={`${buyers.length} active`}>
        {buyers.length === 0 ? (
          <Empty>No buyers yet.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Company</th><th>Contact</th><th>Country</th>
                  <th>Status</th><th>Verification</th><th className="!text-right"></th>
                </tr>
              </thead>
              <tbody>
                {buyers.map(b => (
                  <tr key={b.id}>
                    <td className="font-medium text-slate-900">{b.name}</td>
                    <td>{b.company || '—'}</td>
                    <td className="text-slate-500">
                      {b.contactPerson || '—'}
                      {b.email && <div className="text-xs text-slate-400">{b.email}</div>}
                    </td>
                    <td>{b.country || '—'}</td>
                    <td>
                      <Select className="!py-1 !text-xs" value={b.status} onChange={e => patch(b.id, { status: e.target.value })}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </td>
                    <td>
                      <Select className="!py-1 !text-xs" value={b.verificationStatus} onChange={e => patch(b.id, { verificationStatus: e.target.value })}>
                        {VERIFY.map(s => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </td>
                    <td className="text-right"><Button variant="ghost" onClick={() => archive(b.id)}>Archive</Button></td>
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
