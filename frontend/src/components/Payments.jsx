import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Section, StatCard, Cards, Button, Input, Select, Field, Badge, TableWrap, Empty, ErrorBanner, fmt
} from './ui.jsx';

const EMPTY = { number: '', buyerId: '', amountDue: '', issuedDate: '', dueDate: '' };

export default function Payments({ refreshKey, onChange }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [buyers, setBuyers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([api.invoices.list(), api.invoices.summary(), api.buyers.list()])
    .then(([i, s, b]) => { setRows(i); setSummary(s); setBuyers(b); })
    .catch(e => setErr(e.message));
  useEffect(() => { load(); }, [refreshKey]);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.invoices.create({ ...form, amountDue: Number(form.amountDue) });
      setForm(EMPTY); setErr('');
      await load(); onChange?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  // Mark an invoice fully paid (records the full amount + stamps paid date).
  async function markPaid(inv) {
    try { await api.invoices.update(inv.id, { amountPaid: inv.amountDue }); await load(); onChange?.(); }
    catch (e) { setErr(e.message); }
  }

  const statusKind = (s) => (s === 'paid' ? 'paid' : s === 'partial' ? 'pending' : 'cancelled');

  return (
    <>
      {summary && (
        <Cards cols={4}>
          <StatCard label="Collection Rate" value={`${summary.collectionRatePercent}%`} sub={`${fmt(summary.totalCollected)} of ${fmt(summary.totalBilled)}`} />
          <StatCard label="Outstanding" value={fmt(summary.outstandingAmount)} sub={`${summary.totalInvoices} invoices`} />
          <StatCard label="Overdue" value={summary.overdueCount} sub={`${fmt(summary.overdueAmount)} past due`} accent={summary.overdueCount > 0 ? 'ALERT' : undefined} />
          <StatCard label="Avg Payment Cycle" value={`${summary.avgPaymentCycleDays} days`} sub="issue → paid" />
        </Cards>
      )}

      <Section title="Issue Invoice" subtitle="Track the payment cycle for a buyer billing">
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Invoice # (optional)"><Input value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} placeholder="auto" /></Field>
            <Field label="Buyer">
              <Select value={form.buyerId} onChange={e => setForm({ ...form, buyerId: e.target.value })} required>
                <option value="" disabled>Select buyer</option>
                {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="Amount due"><Input type="number" min="0" step="0.01" value={form.amountDue} onChange={e => setForm({ ...form, amountDue: e.target.value })} required /></Field>
            <Field label="Due date"><Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end"><Button disabled={busy}>{busy ? 'Saving…' : 'Issue invoice'}</Button></div>
          <ErrorBanner>{err}</ErrorBanner>
        </form>
      </Section>

      <Section title="Invoices" subtitle={`${rows.length} total`}>
        {rows.length === 0 ? (
          <Empty>No invoices yet.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th><th>Buyer</th><th>Issued</th><th>Due</th>
                  <th className="!text-right">Due amt</th><th className="!text-right">Paid</th>
                  <th className="!text-right">Days out</th><th>Status</th><th className="!text-right"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(i => (
                  <tr key={i.id}>
                    <td className="font-medium text-slate-900">{i.number}</td>
                    <td>{i.buyerName}</td>
                    <td className="text-slate-500 whitespace-nowrap">{i.issuedDate || '—'}</td>
                    <td className={'whitespace-nowrap ' + (i.overdue ? 'text-rose-600 font-medium' : 'text-slate-500')}>
                      {i.dueDate || '—'}{i.overdue ? ' • overdue' : ''}
                    </td>
                    <td className="text-right tabular-nums">{fmt(i.amountDue)}</td>
                    <td className="text-right tabular-nums">{fmt(i.amountPaid)}</td>
                    <td className="text-right tabular-nums">{i.daysOutstanding ?? '—'}</td>
                    <td><Badge kind={statusKind(i.status)}>{i.status}</Badge></td>
                    <td className="text-right">
                      {i.status !== 'paid' && <Button variant="ghost" onClick={() => markPaid(i)}>Mark paid</Button>}
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
