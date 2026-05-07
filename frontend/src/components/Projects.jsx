import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Section, StatCard, Cards, Button, Input, Select, Field,
  TableWrap, Empty, ErrorBanner, Money, fmt
} from './ui.jsx';

const STATUSES = ['active', 'paused', 'completed', 'cancelled'];

export default function Projects({ refreshKey, onChange }) {
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({
    name: '', description: '', cropType: '', status: 'active', startDate: '', endDate: ''
  });
  const [err, setErr] = useState('');

  const load = () => api.projects.list().then(setProjects).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [refreshKey]);

  async function add(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      await api.projects.create({
        name: form.name.trim(),
        description: form.description.trim(),
        cropType: form.cropType.trim(),
        status: form.status,
        startDate: form.startDate,
        endDate: form.endDate
      });
      setForm({ name: '', description: '', cropType: '', status: 'active', startDate: '', endDate: '' });
      setErr('');
      await load(); onChange?.();
    } catch (e) { setErr(e.message); }
  }

  async function allocate(id) {
    const amount = prompt('Allocate how much (USDC) from treasury?');
    if (!amount) return;
    try {
      await api.transactions.allocate(id, Number(amount));
      await load(); onChange?.();
    } catch (e) { alert(e.message); }
  }

  async function changeStatus(id, status) {
    try {
      await api.projects.update(id, { status });
      await load(); onChange?.();
    } catch (e) { alert(e.message); }
  }

  const totals = projects.reduce((acc, p) => ({
    allocated: acc.allocated + (p.allocated || 0),
    revenue:   acc.revenue   + (p.revenue   || 0),
    profit:    acc.profit    + (p.profit    || 0)
  }), { allocated: 0, revenue: 0, profit: 0 });

  return (
    <>
      <Section title="Add Project" subtitle="Define crop, lifecycle, and timeline">
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Project name">
              <Input placeholder="e.g. Tomato Harvest 2026" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Crop type">
              <Input placeholder="e.g. Spinach" value={form.cropType} onChange={e => setForm({ ...form, cropType: e.target.value })} />
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Description (optional)">
              <Input placeholder="Short description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Start date">
              <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            </Field>
            <Field label="End date">
              <Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
            </Field>
          </div>
          <div className="flex items-center justify-end">
            <Button>Create project</Button>
          </div>
          <ErrorBanner>{err}</ErrorBanner>
        </form>
      </Section>

      {projects.length > 0 && (
        <Cards cols={3}>
          <StatCard label="Total Allocated" value={fmt(totals.allocated)} sub={`${projects.length} project${projects.length === 1 ? '' : 's'}`} />
          <StatCard label="Total Revenue" value={fmt(totals.revenue)} />
          <StatCard label="Total Profit" value={fmt(totals.profit)} />
        </Cards>
      )}

      <Section title="Projects" subtitle="Compare allocation, revenue, and profit across projects">
        {projects.length === 0 ? (
          <Empty>No projects yet.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Crop</th>
                  <th>Status</th>
                  <th>Dates</th>
                  <th className="!text-right">Allocated</th>
                  <th className="!text-right">Paid out</th>
                  <th className="!text-right">Remaining</th>
                  <th className="!text-right">Revenue</th>
                  <th className="!text-right">Profit</th>
                  <th className="!text-right"></th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div className="font-medium text-slate-900">{p.name}</div>
                      {p.description && <div className="text-xs text-slate-500 mt-0.5">{p.description}</div>}
                    </td>
                    <td>{p.cropType || <span className="text-slate-400">—</span>}</td>
                    <td>
                      <Select
                        value={p.status || 'active'}
                        onChange={e => changeStatus(p.id, e.target.value)}
                        className="!py-1 !text-xs"
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </td>
                    <td className="text-xs text-slate-500 whitespace-nowrap">
                      {p.startDate || '—'} <span className="text-slate-300 mx-1">→</span> {p.endDate || '—'}
                    </td>
                    <td className="text-right tabular-nums">{fmt(p.allocated)}</td>
                    <td className="text-right tabular-nums">{fmt(p.paidOut ?? p.spent)}</td>
                    <td className="text-right"><Money value={p.remaining} /></td>
                    <td className="text-right tabular-nums">{fmt(p.revenue ?? 0)}</td>
                    <td className="text-right">
                      <Money value={p.profit ?? 0} signed />
                    </td>
                    <td className="text-right">
                      <Button onClick={() => allocate(p.id)}>Allocate</Button>
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
