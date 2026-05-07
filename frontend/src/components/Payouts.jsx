import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Section, Button, Input, Select, Field, TableWrap, Empty, ErrorBanner, Money
} from './ui.jsx';

export default function Payouts({ refreshKey, onChange }) {
  const [payouts, setPayouts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [form, setForm] = useState({ projectId: '', farmerId: '', amount: '', note: '' });
  const [err, setErr] = useState('');

  const load = () => Promise.all([api.payouts.list(), api.projects.list(), api.farmers.list()])
    .then(([p, pr, f]) => {
      setPayouts(p); setProjects(pr); setFarmers(f);
      setForm(curr => ({
        ...curr,
        projectId: curr.projectId || pr[0]?.id || '',
        farmerId:  curr.farmerId  || f[0]?.id  || ''
      }));
    })
    .catch(e => setErr(e.message));
  useEffect(() => { load(); }, [refreshKey]);

  async function submit(e) {
    e.preventDefault();
    if (!form.farmerId) { setErr('Add a farmer in the Farmers tab first.'); return; }
    try {
      await api.payouts.create({
        projectId: form.projectId,
        farmerId: form.farmerId,
        amount: Number(form.amount),
        note: form.note.trim()
      });
      setForm(f => ({ ...f, amount: '', note: '' }));
      setErr('');
      await load(); onChange?.();
    } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <Section title="Record Farmer Payout" subtitle="Project allocation → registered farmer">
        {farmers.length === 0 && (
          <div className="mb-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            No farmers yet — add one in the Farmers tab before recording a payout.
          </div>
        )}
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Project">
              <Select value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })} required>
                <option value="" disabled>Select project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Farmer">
              <Select value={form.farmerId} onChange={e => setForm({ ...form, farmerId: e.target.value })} required disabled={farmers.length === 0}>
                <option value="" disabled>Select farmer</option>
                {farmers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </Field>
            <Field label="Amount (XLM)">
              <Input type="number" min="0" step="0.01" placeholder="0.00"
                     value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
            </Field>
          </div>
          <Field label="Note (optional)">
            <Input placeholder="e.g. Q1 harvest payment" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
          </Field>
          <div className="flex justify-end">
            <Button disabled={farmers.length === 0}>Record payout</Button>
          </div>
          <ErrorBanner>{err}</ErrorBanner>
        </form>
      </Section>

      <Section title="Payout History" subtitle={`${payouts.length} payouts recorded`}>
        {payouts.length === 0 ? (
          <Empty>No payouts recorded.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Project</th>
                  <th>Farmer</th>
                  <th>Wallet</th>
                  <th className="!text-right">Amount</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map(p => (
                  <tr key={p.id}>
                    <td className="text-slate-500 whitespace-nowrap">{new Date(p.timestamp).toLocaleString()}</td>
                    <td>{p.projectName}</td>
                    <td className="font-medium text-slate-900">{p.farmerName}</td>
                    <td className="mono truncate max-w-[200px]">{p.farmerWallet || '—'}</td>
                    <td className="text-right"><Money value={p.amount} /></td>
                    <td className="text-slate-500">{p.note || '—'}</td>
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
