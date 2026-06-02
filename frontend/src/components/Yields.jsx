import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Section, StatCard, Cards, Button, Input, Select, Field, TableWrap, Empty, ErrorBanner, fmt
} from './ui.jsx';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';

const EMPTY = { projectId: '', cropType: '', plantingDate: '', harvestDate: '', expectedYield: '', actualYield: '', unit: 'kg', revenueGenerated: '' };

export default function Yields({ refreshKey, onChange }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([api.yields.list(), api.yields.summary(), api.projects.list()])
    .then(([y, s, p]) => { setRows(y); setSummary(s); setProjects(p); })
    .catch(e => setErr(e.message));
  useEffect(() => { load(); }, [refreshKey]);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.yields.create({
        ...form,
        expectedYield: Number(form.expectedYield) || 0,
        actualYield: Number(form.actualYield) || 0,
        revenueGenerated: Number(form.revenueGenerated) || 0
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
          <StatCard label="Yield Efficiency" value={`${(summary.efficiencyPercent ?? 0).toFixed(1)}%`} sub="actual vs expected" accent={summary.efficiencyPercent >= 100 ? 'STRONG' : undefined} />
          <StatCard label="Total Actual Yield" value={summary.totalActual.toLocaleString()} sub={`vs ${summary.totalExpected.toLocaleString()} expected`} />
          <StatCard label="Yield Revenue" value={fmt(summary.totalRevenue)} sub="generated from harvests" />
          <StatCard label="Records" value={summary.records} sub="harvest cycles" />
        </Cards>
      )}

      <Section title="Record Yield" subtitle="Expected vs actual yield for a project's growing cycle">
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Project">
              <Select value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })} required>
                <option value="" disabled>Select project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Crop type"><Input value={form.cropType} onChange={e => setForm({ ...form, cropType: e.target.value })} /></Field>
            <Field label="Planting date"><Input type="date" value={form.plantingDate} onChange={e => setForm({ ...form, plantingDate: e.target.value })} /></Field>
            <Field label="Harvest date"><Input type="date" value={form.harvestDate} onChange={e => setForm({ ...form, harvestDate: e.target.value })} /></Field>
            <Field label="Expected yield"><Input type="number" min="0" step="0.01" value={form.expectedYield} onChange={e => setForm({ ...form, expectedYield: e.target.value })} /></Field>
            <Field label="Actual yield"><Input type="number" min="0" step="0.01" value={form.actualYield} onChange={e => setForm({ ...form, actualYield: e.target.value })} /></Field>
            <Field label="Unit"><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></Field>
            <Field label="Revenue generated"><Input type="number" min="0" step="0.01" value={form.revenueGenerated} onChange={e => setForm({ ...form, revenueGenerated: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end"><Button disabled={busy}>{busy ? 'Saving…' : 'Record yield'}</Button></div>
          <ErrorBanner>{err}</ErrorBanner>
        </form>
      </Section>

      {summary?.trend?.length > 0 && (
        <Section title="Yield Trend" subtitle="Expected vs actual yield over harvest dates">
          <div className="h-72 -mx-2">
            <ResponsiveContainer>
              <LineChart data={summary.trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="expected" name="Expected" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                <Line type="monotone" dataKey="actual" name="Actual" stroke="#047857" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      <Section title="Yield Records" subtitle={`${rows.length} total`}>
        {rows.length === 0 ? (
          <Empty>No yield records yet.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Project</th><th>Crop</th><th>Harvest</th>
                  <th className="!text-right">Expected</th><th className="!text-right">Actual</th>
                  <th className="!text-right">Variance</th><th className="!text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(y => (
                  <tr key={y.id}>
                    <td className="font-medium text-slate-900">{y.projectName}</td>
                    <td>{y.cropType || '—'}</td>
                    <td className="text-slate-500 whitespace-nowrap">{y.harvestDate || '—'}</td>
                    <td className="text-right tabular-nums">{y.expectedYield.toLocaleString()} {y.unit}</td>
                    <td className="text-right tabular-nums">{y.actualYield.toLocaleString()} {y.unit}</td>
                    <td className="text-right tabular-nums">
                      <span className={y.yieldVariance > 0 ? 'text-emerald-700' : y.yieldVariance < 0 ? 'text-rose-700' : 'text-slate-700'}>
                        {y.yieldVariance > 0 ? '+' : ''}{y.yieldVariance.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400"> ({y.variancePercent}%)</span>
                    </td>
                    <td className="text-right tabular-nums">{fmt(y.revenueGenerated)}</td>
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
