import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Section, StatCard, Cards, Button, Input, Select, Field, Badge, TableWrap, Empty, ErrorBanner, fmt
} from './ui.jsx';

const statusKind = (s) => (s === 'approved' ? 'paid' : s === 'rejected' ? 'cancelled' : 'pending');
const EVIDENCE_CATEGORIES = ['Milestone Evidence', 'Site Photos'];
const EMPTY = {
  title: '', description: '', targetDate: '', completionDate: '', releaseAmount: '', completionPercent: '',
  gpsNotes: '', verificationNotes: '', docName: '', docUrl: ''
};

export default function Milestones({ refreshKey, onChange }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [milestones, setMilestones] = useState([]);
  const [budget, setBudget] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [evidenceDocs, setEvidenceDocs] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [attachSel, setAttachSel] = useState('');

  useEffect(() => {
    api.projects.list()
      .then(p => { setProjects(p); setProjectId(curr => curr || p[0]?.id || ''); })
      .catch(e => setErr(e.message));
    // Documents available to attach as milestone evidence (active only).
    api.documents.list({ status: 'active' })
      .then(r => setEvidenceDocs((r.data || r).filter(d => EVIDENCE_CATEGORIES.includes(d.category))))
      .catch(() => {});
  }, [refreshKey]);

  const loadProject = () => {
    if (!projectId) return;
    Promise.all([api.milestones.list(projectId), api.milestones.releaseBudget(projectId)])
      .then(([m, b]) => { setMilestones(m); setBudget(b); })
      .catch(e => setErr(e.message));
  };
  useEffect(() => { loadProject(); }, [projectId, refreshKey]);

  async function attach(milestoneId) {
    if (!attachSel) return;
    try { await api.milestones.attach(milestoneId, attachSel); setAttachSel(''); loadProject(); onChange?.(); }
    catch (e) { setErr(e.message); }
  }
  async function detach(milestoneId, documentId) {
    try { await api.milestones.detach(milestoneId, documentId); loadProject(); onChange?.(); }
    catch (e) { setErr(e.message); }
  }

  const project = projects.find(p => p.id === projectId);

  async function add(e) {
    e.preventDefault();
    if (!projectId) return;
    setBusy(true);
    try {
      await api.milestones.create({
        projectId,
        title: form.title,
        description: form.description,
        targetDate: form.targetDate,
        completionDate: form.completionDate,
        gpsNotes: form.gpsNotes,
        verificationNotes: form.verificationNotes,
        releaseAmount: Number(form.releaseAmount) || 0,
        completionPercent: Number(form.completionPercent) || 0,
        verificationDocs: form.docName || form.docUrl ? [{ name: form.docName, url: form.docUrl }] : []
      });
      setForm(EMPTY); setErr('');
      loadProject(); onChange?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function decide(id, action) {
    try {
      if (action === 'approve') await api.milestones.approve(id);
      else await api.milestones.reject(id);
      setErr(''); loadProject(); onChange?.();
    } catch (e) { setErr(e.message); }
  }

  async function toggleGovernance() {
    try { await api.projects.update(projectId, { governanceEnabled: !project?.governanceEnabled }); onChange?.();
      const p = await api.projects.list(); setProjects(p);
    } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <Section
        title="Milestone-Based Capital Release"
        subtitle="When governance is enabled for a project, treasury allocations are capped at the approved milestone release budget."
        action={
          <Select value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="" disabled>Select project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        }
      >
        {budget && (
          <Cards cols={3}>
            <StatCard label="Approved Release Budget" value={fmt(budget.approvedReleaseBudget)} sub="unlocked by approved milestones" />
            <StatCard label="Allocated So Far" value={fmt(budget.allocated)} sub={`${fmt(Math.max(0, budget.approvedReleaseBudget - budget.allocated))} headroom`} />
            <StatCard
              label="Milestone Gating"
              value={project?.governanceEnabled ? 'ON' : 'OFF'}
              sub={project?.governanceEnabled ? 'allocations gated' : 'allocations ungated'}
              accent={project?.governanceEnabled ? 'GATED' : undefined}
            />
          </Cards>
        )}
        <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
          <span className="text-sm text-slate-600">
            {project?.governanceEnabled
              ? 'Allocations to this project require approved milestone budget.'
              : 'Allocations to this project are not milestone-gated.'}
          </span>
          <Button variant="ghost" onClick={toggleGovernance} disabled={!projectId}>
            {project?.governanceEnabled ? 'Disable gating' : 'Enable gating'}
          </Button>
        </div>
        <div className="mt-3"><ErrorBanner>{err}</ErrorBanner></div>
      </Section>

      <Section title="Add Milestone" subtitle="Define a release milestone with optional verification document">
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Title"><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></Field>
            <Field label="Target date"><Input type="date" value={form.targetDate} onChange={e => setForm({ ...form, targetDate: e.target.value })} /></Field>
            <Field label="Completion date"><Input type="date" value={form.completionDate} onChange={e => setForm({ ...form, completionDate: e.target.value })} /></Field>
            <Field label="Release amount (XLM)"><Input type="number" min="0" step="0.01" value={form.releaseAmount} onChange={e => setForm({ ...form, releaseAmount: e.target.value })} /></Field>
            <Field label="Completion %"><Input type="number" min="0" max="100" value={form.completionPercent} onChange={e => setForm({ ...form, completionPercent: e.target.value })} /></Field>
            <Field label="GPS notes"><Input value={form.gpsNotes} onChange={e => setForm({ ...form, gpsNotes: e.target.value })} placeholder="lat, lng or notes" /></Field>
            <Field label="Verification doc name"><Input value={form.docName} onChange={e => setForm({ ...form, docName: e.target.value })} /></Field>
            <Field label="Verification doc URL"><Input value={form.docUrl} onChange={e => setForm({ ...form, docUrl: e.target.value })} placeholder="https://…" /></Field>
          </div>
          <Field label="Description"><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Verification notes"><Input value={form.verificationNotes} onChange={e => setForm({ ...form, verificationNotes: e.target.value })} placeholder="Reviewer notes" /></Field>
          <div className="flex justify-end"><Button disabled={busy || !projectId}>{busy ? 'Saving…' : 'Add milestone'}</Button></div>
        </form>
      </Section>

      <Section title="Milestones" subtitle={`${milestones.length} for this project`}>
        {milestones.length === 0 ? (
          <Empty>No milestones yet.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Title</th><th>Target</th><th className="!text-right">Completion</th>
                  <th className="!text-right">Release</th><th>Docs</th><th>Status</th><th className="!text-right"></th>
                </tr>
              </thead>
              <tbody>
                {milestones.map(m => {
                  const evidenceCount = (m.documents?.length || 0) + (m.photos?.length || 0);
                  return (
                  <React.Fragment key={m.id}>
                  <tr>
                    <td className="font-medium text-slate-900">{m.title}{m.description && <div className="text-xs text-slate-500">{m.description}</div>}</td>
                    <td className="text-slate-500 whitespace-nowrap">{m.targetDate || '—'}{m.completionDate && <div className="text-xs text-emerald-600">done {m.completionDate}</div>}</td>
                    <td className="text-right tabular-nums">{m.completionPercent}%</td>
                    <td className="text-right tabular-nums">{fmt(m.releaseAmount)}</td>
                    <td className="text-xs">
                      {(m.verificationDocs || []).length === 0 ? <span className="text-slate-400">—</span> :
                        m.verificationDocs.map((d, i) => (
                          <div key={i}>{d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{d.name || 'doc'}</a> : (d.name || '—')}</div>
                        ))}
                    </td>
                    <td><Badge kind={statusKind(m.approvalStatus)}>{m.approvalStatus}</Badge></td>
                    <td className="text-right">
                      <div className="inline-flex gap-2">
                        <Button variant="ghost" onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
                          Evidence{evidenceCount ? ` (${evidenceCount})` : ''}
                        </Button>
                        {m.approvalStatus === 'pending' && (
                          <>
                            <Button variant="ghost" onClick={() => decide(m.id, 'reject')}>Reject</Button>
                            <Button onClick={() => decide(m.id, 'approve')}>Approve</Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === m.id && (
                    <tr>
                      <td colSpan={7} className="bg-slate-50/60">
                        <div className="px-2 py-2 space-y-2">
                          {m.gpsNotes && <div className="text-xs text-slate-600"><span className="font-medium">GPS:</span> {m.gpsNotes}</div>}
                          {m.verificationNotes && <div className="text-xs text-slate-600"><span className="font-medium">Verification:</span> {m.verificationNotes}</div>}
                          <div className="text-xs font-medium text-slate-700">Attached evidence</div>
                          {evidenceCount === 0 ? (
                            <div className="text-xs text-slate-400">No documents or photos attached.</div>
                          ) : (
                            <div className="space-y-1">
                              {[...(m.documents || []).map(d => ({ ...d, kind: 'doc' })), ...(m.photos || []).map(d => ({ ...d, kind: 'photo' }))].map(d => (
                                <div key={d.documentId} className="flex items-center justify-between text-xs">
                                  <span>{d.kind === 'photo' ? '🖼️' : '📄'} {d.title} <span className="text-slate-400">({d.fileName})</span></span>
                                  <button className="text-rose-600 hover:underline" onClick={() => detach(m.id, d.documentId)}>detach</button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2 pt-1">
                            <Select value={attachSel} onChange={e => setAttachSel(e.target.value)}>
                              <option value="">Select a document…</option>
                              {evidenceDocs.map(d => <option key={d.id} value={d.id}>{d.category === 'Site Photos' ? '🖼️ ' : '📄 '}{d.title}</option>)}
                            </Select>
                            <Button variant="ghost" onClick={() => attach(m.id)} disabled={!attachSel}>Attach</Button>
                            <span className="text-[11px] text-slate-400">Upload files in the Documents tab (category “Milestone Evidence” or “Site Photos”).</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>
    </>
  );
}
