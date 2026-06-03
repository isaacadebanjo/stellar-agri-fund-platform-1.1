import React, { useEffect, useRef, useState } from 'react';
import { api, downloadBlob, openBlob } from '../api.js';
import {
  Section, StatCard, Cards, Button, Input, Select, Field, Badge, TableWrap, Empty, ErrorBanner, Toolbar
} from './ui.jsx';

const fmtBytes = (n) => {
  if (!n) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
const statusKind = (s) => (s === 'archived' ? 'cancelled' : 'paid');
const EMPTY = { title: '', category: '', description: '', relatedProjectId: '', relatedBuyerId: '', relatedInvestorId: '', investorVisible: false };

export default function Documents({ refreshKey, onChange }) {
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [investors, setInvestors] = useState([]);
  const [docs, setDocs] = useState([]);
  const [filter, setFilter] = useState({ q: '', category: '', status: 'active' });
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [versionsFor, setVersionsFor] = useState(null);
  const [versions, setVersions] = useState([]);
  const versionInputRef = useRef(null);
  const versioningId = useRef(null);

  useEffect(() => {
    api.documents.categories().then(r => setCategories(r.categories)).catch(() => {});
    api.projects.list().then(setProjects).catch(() => {});
    api.buyers.list().then(b => setBuyers(b.data || b)).catch(() => {});
    api.investors.list().then(setInvestors).catch(() => {});
  }, []);

  const load = () => api.documents.list({ ...filter, status: filter.status })
    .then(r => setDocs(r.data || r)).catch(e => setErr(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, filter]);

  async function submit(e) {
    e.preventDefault();
    if (!file) { setErr('Choose a file to upload.'); return; }
    if (!form.category) { setErr('Choose a category.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      await api.documents.upload(fd);
      setForm(EMPTY); setFile(null); setErr('');
      document.getElementById('doc-file-input').value = '';
      load(); onChange?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function download(d) {
    try { downloadBlob(d.fileName || d.title, await api.documents.downloadBlob(d.id)); }
    catch (e) { setErr(e.message); }
  }
  async function preview(d) {
    try { openBlob(await api.documents.previewBlob(d.id)); }
    catch (e) { setErr(e.message); }
  }
  async function archive(d) {
    try { await api.documents.archive(d.id); load(); onChange?.(); }
    catch (e) { setErr(e.message); }
  }
  async function showVersions(d) {
    if (versionsFor === d.id) { setVersionsFor(null); return; }
    try { setVersions(await api.documents.versions(d.id)); setVersionsFor(d.id); }
    catch (e) { setErr(e.message); }
  }
  function startVersion(d) { versioningId.current = d.id; versionInputRef.current?.click(); }
  async function onVersionFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !versioningId.current) return;
    try {
      const fd = new FormData();
      fd.append('file', f);
      await api.documents.uploadVersion(versioningId.current, fd);
      load(); onChange?.();
    } catch (e) { setErr(e.message); }
  }

  const byCategory = docs.reduce((acc, d) => { acc[d.category] = (acc[d.category] || 0) + 1; return acc; }, {});

  return (
    <>
      <Cards cols={4}>
        <StatCard label="Documents" value={docs.length} sub={`${filter.status} view`} />
        <StatCard label="Categories in use" value={Object.keys(byCategory).length} sub={`of ${categories.length}`} />
        <StatCard label="Investor-visible" value={docs.filter(d => d.investorVisible).length} sub="shown in data room" />
        <StatCard label="Total size" value={fmtBytes(docs.reduce((s, d) => s + (d.fileSize || 0), 0))} sub="stored bytes" />
      </Cards>

      <Section title="Upload Document" subtitle="Store a file with metadata, version history, and optional relations.">
        <ErrorBanner>{err}</ErrorBanner>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Title"><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></Field>
            <Field label="Category">
              <Select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required>
                <option value="" disabled>Select category</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="File"><input id="doc-file-input" type="file" className="input" onChange={e => setFile(e.target.files?.[0] || null)} /></Field>
            <Field label="Related project">
              <Select value={form.relatedProjectId} onChange={e => setForm({ ...form, relatedProjectId: e.target.value })}>
                <option value="">—</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Related buyer">
              <Select value={form.relatedBuyerId} onChange={e => setForm({ ...form, relatedBuyerId: e.target.value })}>
                <option value="">—</option>
                {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="Related investor">
              <Select value={form.relatedInvestorId} onChange={e => setForm({ ...form, relatedInvestorId: e.target.value })}>
                <option value="">—</option>
                {investors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Description"><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input type="checkbox" checked={form.investorVisible} onChange={e => setForm({ ...form, investorVisible: e.target.checked })} />
            Visible to investors in the Data Room
          </label>
          <div className="flex justify-end"><Button disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</Button></div>
        </form>
      </Section>

      <Section
        title="Documents"
        subtitle={`${docs.length} ${filter.status === 'all' ? '' : filter.status} document(s)`}
        action={
          <Toolbar>
            <Input placeholder="Search…" value={filter.q} onChange={e => setFilter({ ...filter, q: e.target.value })} />
            <Select value={filter.category} onChange={e => setFilter({ ...filter, category: e.target.value })}>
              <option value="">All categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </Select>
          </Toolbar>
        }
      >
        <input ref={versionInputRef} type="file" className="hidden" onChange={onVersionFile} />
        {docs.length === 0 ? (
          <Empty>No documents found.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Title</th><th>Category</th><th className="!text-right">Ver</th>
                  <th className="!text-right">Size</th><th>Uploaded</th><th>Status</th><th className="!text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(d => (
                  <React.Fragment key={d.id}>
                    <tr>
                      <td className="font-medium text-slate-900">
                        {d.title}
                        {d.investorVisible && <span className="ml-2 text-[10px] uppercase tracking-wide text-brand-700">investor</span>}
                        {d.description && <div className="text-xs text-slate-500">{d.description}</div>}
                      </td>
                      <td className="text-slate-600">{d.category}</td>
                      <td className="text-right tabular-nums">v{d.version}</td>
                      <td className="text-right tabular-nums">{fmtBytes(d.fileSize)}</td>
                      <td className="text-slate-500 whitespace-nowrap">{new Date(d.createdAt).toLocaleDateString()}</td>
                      <td><Badge kind={statusKind(d.status)}>{d.status}</Badge></td>
                      <td className="text-right">
                        <div className="inline-flex gap-1.5 flex-wrap justify-end">
                          <Button variant="ghost" onClick={() => preview(d)}>Preview</Button>
                          <Button variant="ghost" onClick={() => download(d)}>Download</Button>
                          <Button variant="ghost" onClick={() => startVersion(d)}>New ver</Button>
                          <Button variant="ghost" onClick={() => showVersions(d)}>{versionsFor === d.id ? 'Hide' : 'History'}</Button>
                          {d.status === 'active' && <Button variant="danger" onClick={() => archive(d)}>Archive</Button>}
                        </div>
                      </td>
                    </tr>
                    {versionsFor === d.id && (
                      <tr>
                        <td colSpan={7} className="bg-slate-50/60">
                          <div className="text-xs text-slate-600 px-2 py-1">
                            {versions.map(v => (
                              <div key={v.id} className="flex items-center justify-between py-0.5">
                                <span>v{v.version} · {v.fileName} · {fmtBytes(v.fileSize)} · {new Date(v.createdAt).toLocaleString()}</span>
                                <button className="text-brand-700 hover:underline" onClick={() => download(v)}>download</button>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>
    </>
  );
}
