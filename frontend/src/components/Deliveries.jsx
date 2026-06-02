import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Section, StatCard, Cards, Button, Input, Select, Field, TableWrap, Empty, ErrorBanner, fmt
} from './ui.jsx';

const PAYMENT = ['pending', 'partial', 'paid'];
const EMPTY = { harvestBatch: '', buyerId: '', offtakeId: '', projectId: '', quantityDelivered: '', unit: 'kg', unitPrice: '', deliveryDate: '', paymentStatus: 'pending' };

export default function Deliveries({ refreshKey, onChange }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [buyers, setBuyers] = useState([]);
  const [offtakes, setOfftakes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([api.deliveries.list(), api.deliveries.summary(), api.buyers.list(), api.offtake.list(), api.projects.list()])
    .then(([d, s, b, o, p]) => { setRows(d); setSummary(s); setBuyers(b); setOfftakes(o); setProjects(p); })
    .catch(e => setErr(e.message));
  useEffect(() => { load(); }, [refreshKey]);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.deliveries.create({
        ...form,
        quantityDelivered: Number(form.quantityDelivered),
        unitPrice: Number(form.unitPrice),
        offtakeId: form.offtakeId || null,
        projectId: form.projectId || null
      });
      setForm(EMPTY); setErr('');
      await load(); onChange?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <>
      {summary && (
        <Cards cols={4}>
          <StatCard label="Delivered vs Contracted" value={`${summary.deliveredVsContractedPercent}%`} sub={`${summary.deliveredVolume.toLocaleString()} delivered`} />
          <StatCard label="Outstanding Deliveries" value={summary.outstandingDeliveries} sub={`${fmt(summary.outstandingValue)} unpaid`} accent={summary.outstandingDeliveries > 0 ? 'OPEN' : undefined} />
          <StatCard label="Revenue Generated" value={fmt(summary.revenueGenerated)} sub={`${summary.totalDeliveries} deliveries`} />
          <StatCard label="Revenue Collected" value={fmt(summary.revenueCollected)} sub="marked paid" />
        </Cards>
      )}

      <Section title="Record Delivery" subtitle="Harvest batch delivered against an offtake agreement">
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Harvest batch"><Input value={form.harvestBatch} onChange={e => setForm({ ...form, harvestBatch: e.target.value })} /></Field>
            <Field label="Buyer">
              <Select value={form.buyerId} onChange={e => setForm({ ...form, buyerId: e.target.value })} required>
                <option value="" disabled>Select buyer</option>
                {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="Offtake agreement (optional)">
              <Select value={form.offtakeId} onChange={e => setForm({ ...form, offtakeId: e.target.value })}>
                <option value="">—</option>
                {offtakes.map(o => <option key={o.id} value={o.id}>{o.agreementNumber}</option>)}
              </Select>
            </Field>
            <Field label="Project (optional)">
              <Select value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })}>
                <option value="">—</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Quantity"><Input type="number" min="0" step="0.01" value={form.quantityDelivered} onChange={e => setForm({ ...form, quantityDelivered: e.target.value })} required /></Field>
            <Field label="Unit"><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></Field>
            <Field label="Unit price"><Input type="number" min="0" step="0.01" value={form.unitPrice} onChange={e => setForm({ ...form, unitPrice: e.target.value })} required /></Field>
            <Field label="Delivery date"><Input type="date" value={form.deliveryDate} onChange={e => setForm({ ...form, deliveryDate: e.target.value })} /></Field>
            <Field label="Payment status">
              <Select value={form.paymentStatus} onChange={e => setForm({ ...form, paymentStatus: e.target.value })}>
                {PAYMENT.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="text-xs text-slate-500">
              Invoice amount: {fmt((Number(form.quantityDelivered) || 0) * (Number(form.unitPrice) || 0))}
            </span>
            <Button disabled={busy}>{busy ? 'Saving…' : 'Record delivery'}</Button>
          </div>
          <ErrorBanner>{err}</ErrorBanner>
        </form>
      </Section>

      <Section title="Deliveries" subtitle={`${rows.length} total`}>
        {rows.length === 0 ? (
          <Empty>No deliveries yet.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Batch</th><th>Date</th><th>Buyer</th><th>Project</th>
                  <th className="!text-right">Quantity</th><th className="!text-right">Invoice</th><th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(d => (
                  <tr key={d.id}>
                    <td className="font-medium text-slate-900">{d.harvestBatch || '—'}</td>
                    <td className="text-slate-500 whitespace-nowrap">{d.deliveryDate || '—'}</td>
                    <td>{d.buyerName}</td>
                    <td>{d.projectName}</td>
                    <td className="text-right tabular-nums">{d.quantityDelivered.toLocaleString()} {d.unit}</td>
                    <td className="text-right tabular-nums">{fmt(d.invoiceAmount)}</td>
                    <td>
                      <Select className="!py-1 !text-xs" value={d.paymentStatus} onChange={e => api.deliveries.update(d.id, { paymentStatus: e.target.value }).then(load)}>
                        {PAYMENT.map(s => <option key={s} value={s}>{s}</option>)}
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
