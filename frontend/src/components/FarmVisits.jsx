import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Section, StatCard, Cards, Button, Input, Select, Field, TableWrap, Empty, ErrorBanner, Badge
} from './ui.jsx';

const EMPTY = {
  projectId: '', inspector: '', visitDate: '', gpsLat: '', gpsLng: '', gpsNotes: '',
  comments: '', findings: '', farmHealthScore: '', complianceScore: '', operationalStatus: 'on_track'
};

const STATUS_LABELS = { on_track: 'On Track', attention: 'Needs Attention', at_risk: 'At Risk' };
const statusKind = (s) => (s === 'at_risk' ? 'cancelled' : s === 'attention' ? 'pending' : 'paid');
const scoreColor = (s) => (s >= 75 ? 'text-emerald-700' : s >= 50 ? 'text-amber-700' : 'text-rose-700');

export default function FarmVisits({ refreshKey, onChange }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([api.farmVisits.list(), api.farmVisits.summary(), api.projects.list()])
    .then(([v, s, p]) => { setRows(v); setSummary(s); setProjects(p); })
    .catch(e => setErr(e.message));
  useEffect(() => { load(); }, [refreshKey]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.farmVisits.create({
        ...form,
        farmHealthScore: Number(form.farmHealthScore) || 0,
        complianceScore: Number(form.complianceScore) || 0,
        gpsLat: form.gpsLat === '' ? '' : Number(form.gpsLat),
        gpsLng: form.gpsLng === '' ? '' : Number(form.gpsLng)
      });
      setForm(EMPTY); setErr('');
      await load(); onChange?.();
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }

  return (
    <>
      {summary && (
        <Cards cols={4}>
          <StatCard label="Avg Farm Health" value={`${summary.avgHealthScore}/100`} sub="across all visits" accent={summary.avgHealthScore >= 75 ? 'STRONG' : undefined} />
          <StatCard label="Avg Compliance" value={`${summary.avgComplianceScore}/100`} sub="operational compliance" />
          <StatCard label="At Risk" value={summary.statusBreakdown?.at_risk ?? 0} sub="projects flagged at-risk" accent={summary.statusBreakdown?.at_risk ? 'ACTION' : undefined} />
          <StatCard label="Total Visits" value={summary.count} sub="inspections logged" />
        </Cards>
      )}

      <Section title="Record Farm Visit" subtitle="On-site inspection: health, compliance, GPS, findings">
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Project">
              <Select value={form.projectId} onChange={set('projectId')} required>
                <option value="" disabled>Select project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Inspector"><Input value={form.inspector} onChange={set('inspector')} /></Field>
            <Field label="Visit date"><Input type="date" value={form.visitDate} onChange={set('visitDate')} /></Field>
            <Field label="Operational status">
              <Select value={form.operationalStatus} onChange={set('operationalStatus')}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Farm health score (0–100)"><Input type="number" min="0" max="100" value={form.farmHealthScore} onChange={set('farmHealthScore')} /></Field>
            <Field label="Compliance score (0–100)"><Input type="number" min="0" max="100" value={form.complianceScore} onChange={set('complianceScore')} /></Field>
            <Field label="GPS latitude"><Input type="number" step="any" value={form.gpsLat} onChange={set('gpsLat')} /></Field>
            <Field label="GPS longitude"><Input type="number" step="any" value={form.gpsLng} onChange={set('gpsLng')} /></Field>
            <Field label="GPS notes" className="lg:col-span-2"><Input value={form.gpsNotes} onChange={set('gpsNotes')} /></Field>
            <Field label="Findings" className="lg:col-span-2"><Input value={form.findings} onChange={set('findings')} /></Field>
            <Field label="Comments" className="lg:col-span-4"><Input value={form.comments} onChange={set('comments')} /></Field>
          </div>
          <div className="flex justify-end"><Button disabled={busy}>{busy ? 'Saving…' : 'Record visit'}</Button></div>
          <ErrorBanner>{err}</ErrorBanner>
        </form>
      </Section>

      <Section title="Farm Visit Reports" subtitle={`${rows.length} total`}>
        {rows.length === 0 ? (
          <Empty>No farm visits recorded yet.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Project</th><th>Date</th><th>Inspector</th>
                  <th className="!text-right">Health</th><th className="!text-right">Compliance</th>
                  <th>Status</th><th>Findings</th><th>GPS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(v => (
                  <tr key={v.id}>
                    <td className="font-medium text-slate-900">{v.projectName}</td>
                    <td className="text-slate-500 whitespace-nowrap">{v.visitDate || '—'}</td>
                    <td>{v.inspector || '—'}</td>
                    <td className={`text-right tabular-nums font-medium ${scoreColor(v.farmHealthScore)}`}>{v.farmHealthScore}</td>
                    <td className={`text-right tabular-nums font-medium ${scoreColor(v.complianceScore)}`}>{v.complianceScore}</td>
                    <td><Badge kind={statusKind(v.operationalStatus)}>{STATUS_LABELS[v.operationalStatus]}</Badge></td>
                    <td className="text-slate-500 max-w-xs truncate">{v.findings || '—'}</td>
                    <td className="text-xs text-slate-400 whitespace-nowrap">
                      {v.gpsLat != null && v.gpsLng != null ? `${v.gpsLat.toFixed(4)}, ${v.gpsLng.toFixed(4)}` : (v.gpsNotes || '—')}
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
