import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Section, Button, Input, Select, Field, TableWrap, Empty, ErrorBanner, Money, fmt
} from './ui.jsx';

export default function Revenue({ refreshKey, onChange }) {
  const [rows, setRows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({ projectId: '', amount: '', source: '' });
  const [filter, setFilter] = useState('all');
  const [err, setErr] = useState('');

  const load = () => Promise.all([api.revenue.list(), api.projects.list()])
    .then(([rev, pr]) => {
      setRows(rev); setProjects(pr);
      if (!form.projectId && pr[0]) setForm(f => ({ ...f, projectId: pr[0].id }));
    })
    .catch(e => setErr(e.message));
  useEffect(() => { load(); }, [refreshKey]);

  async function submit(e) {
    e.preventDefault();
    try {
      await api.revenue.create({
        projectId: form.projectId,
        amount: Number(form.amount),
        source: form.source.trim()
      });
      setForm(f => ({ ...f, amount: '', source: '' }));
      setErr('');
      await load(); onChange?.();
    } catch (e) { setErr(e.message); }
  }

  const filtered = filter === 'all' ? rows : rows.filter(r => r.projectId === filter);
  const totalForView = filtered.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <Section title="Record Revenue" subtitle="Inflow from buyers, markets, or other sources">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Project">
              <Select value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })} required>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Amount (XLM)">
              <Input type="number" min="0" step="0.01" placeholder="0.00"
                     value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
            </Field>
            <Field label="Source">
              <Input placeholder="e.g. market, buyer name" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button>Record revenue</Button>
          </div>
          <ErrorBanner>{err}</ErrorBanner>
        </form>
      </Section>

      <Section
        title="Revenue History"
        subtitle={<>Total in view: <span className="font-semibold text-slate-900">{fmt(totalForView)}</span></>}
        action={
          <Select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        }
      >
        {filtered.length === 0 ? (
          <Empty>No revenue recorded.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Project</th>
                  <th>Source</th>
                  <th className="!text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td className="text-slate-500 whitespace-nowrap">{new Date(r.timestamp).toLocaleString()}</td>
                    <td>{r.projectName}</td>
                    <td className="text-slate-500">{r.source || '—'}</td>
                    <td className="text-right"><Money value={r.amount} /></td>
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
