import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Section, StatCard, Cards, Button, Input, Select, Field, TableWrap, Empty, ErrorBanner, fmt
} from './ui.jsx';

const STATUSES = ['draft', 'active', 'completed', 'cancelled'];
const EMPTY = { agreementNumber: '', buyerId: '', projectId: '', crop: '', quantityCommitted: '', unit: 'kg', unitPrice: '', startDate: '', endDate: '', status: 'active' };

export default function Offtake({ refreshKey, onChange }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [buyers, setBuyers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([api.offtake.list(), api.offtake.summary(), api.buyers.list(), api.projects.list()])
    .then(([o, s, b, p]) => { setRows(o); setSummary(s); setBuyers(b); setProjects(p); })
    .catch(e => setErr(e.message));
  useEffect(() => { load(); }, [refreshKey]);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.offtake.create({
        ...form,
        quantityCommitted: Number(form.quantityCommitted),
        unitPrice: Number(form.unitPrice)
      });
      setForm(EMPTY); setErr('');
      await load(); onChange?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <>
      {summary && (
        <Cards cols={3}>
          <StatCard label="Contracted Revenue" value={fmt(summary.totalContractedRevenue)} sub={`${summary.activeContracts} active contracts`} />
          <StatCard label="Contract Utilization" value={`${summary.utilizationPercent}%`} sub={`${fmt(summary.deliveredValue)} delivered`} accent={summary.utilizationPercent >= 100 ? 'FULL' : undefined} />
          <StatCard label="Remaining Commitments" value={fmt(summary.remainingCommitmentValue)} sub={`${summary.remainingCommitmentVolume.toLocaleString()} units to deliver`} />
        </Cards>
      )}

      <Section title="New Offtake Agreement" subtitle="Buyer commits to purchase a project's crop">
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Agreement #"><Input value={form.agreementNumber} onChange={e => setForm({ ...form, agreementNumber: e.target.value })} required /></Field>
            <Field label="Buyer">
              <Select value={form.buyerId} onChange={e => setForm({ ...form, buyerId: e.target.value })} required>
                <option value="" disabled>Select buyer</option>
                {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="Project">
              <Select value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })} required>
                <option value="" disabled>Select project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Crop"><Input value={form.crop} onChange={e => setForm({ ...form, crop: e.target.value })} /></Field>
            <Field label="Quantity"><Input type="number" min="0" step="0.01" value={form.quantityCommitted} onChange={e => setForm({ ...form, quantityCommitted: e.target.value })} required /></Field>
            <Field label="Unit"><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></Field>
            <Field label="Unit price"><Input type="number" min="0" step="0.01" value={form.unitPrice} onChange={e => setForm({ ...form, unitPrice: e.target.value })} required /></Field>
            <Field label="Start date"><Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></Field>
            <Field label="End date"><Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></Field>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="text-xs text-slate-500">
              Contract value: {fmt((Number(form.quantityCommitted) || 0) * (Number(form.unitPrice) || 0))}
            </span>
            <Button disabled={busy}>{busy ? 'Saving…' : 'Create agreement'}</Button>
          </div>
          <ErrorBanner>{err}</ErrorBanner>
        </form>
      </Section>

      <Section title="Offtake Agreements" subtitle={`${rows.length} total`}>
        {rows.length === 0 ? (
          <Empty>No agreements yet.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Agreement #</th><th>Buyer</th><th>Project</th><th>Crop</th>
                  <th className="!text-right">Quantity</th><th className="!text-right">Unit price</th>
                  <th className="!text-right">Contract value</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(o => (
                  <tr key={o.id}>
                    <td className="font-medium text-slate-900">{o.agreementNumber}</td>
                    <td>{o.buyerName}</td>
                    <td>{o.projectName}</td>
                    <td>{o.crop || '—'}</td>
                    <td className="text-right tabular-nums">{o.quantityCommitted.toLocaleString()} {o.unit}</td>
                    <td className="text-right tabular-nums">{fmt(o.unitPrice)}</td>
                    <td className="text-right tabular-nums">{fmt(o.contractValue)}</td>
                    <td>
                      <Select className="!py-1 !text-xs" value={o.status} onChange={e => api.offtake.update(o.id, { status: e.target.value }).then(load)}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </td>
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
