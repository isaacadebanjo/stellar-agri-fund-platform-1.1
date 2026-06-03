import React, { useEffect, useState } from 'react';
import { api, downloadBlob } from '../api.js';
import {
  Section, StatCard, Cards, Button, Input, Select, Field, Badge, TableWrap, Empty, ErrorBanner, Toolbar, fmt
} from './ui.jsx';

// Investor due-diligence portal. Investors see only their own scoped data;
// admins see everything (and may inspect a single investor via the selector).
export default function DataRoom({ refreshKey, isAdmin }) {
  const [investors, setInvestors] = useState([]);
  const [investorId, setInvestorId] = useState(''); // admin-only "view as"
  const [overview, setOverview] = useState(null);
  const [docs, setDocs] = useState([]);
  const [filter, setFilter] = useState({ q: '', category: '', from: '', to: '' });
  const [err, setErr] = useState('');

  const scopeParams = isAdmin && investorId ? { investorId } : {};

  useEffect(() => {
    if (isAdmin) api.investors.list().then(setInvestors).catch(() => {});
  }, [isAdmin]);

  const loadOverview = () => api.dataRoom.overview(scopeParams)
    .then(setOverview).catch(e => setErr(e.message));
  const loadDocs = () => api.dataRoom.documents({ ...filter, ...scopeParams })
    .then(r => setDocs(r.data || r)).catch(e => setErr(e.message));

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, investorId]);
  useEffect(() => {
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, investorId, filter]);

  async function download(d) {
    try { downloadBlob(d.fileName || d.title, await api.dataRoom.downloadBlob(d.id, scopeParams)); }
    catch (e) { setErr(e.message); }
  }
  async function downloadStatement() {
    try { downloadBlob('Investor-Statement.pdf', await api.dataRoom.statementPdf(scopeParams)); }
    catch (e) { setErr(e.message); }
  }

  const c = overview?.cards;

  return (
    <>
      <Section
        title="Investor Data Room"
        subtitle="Due-diligence documents, statements, and reports — access-controlled."
        action={isAdmin ? (
          <Select value={investorId} onChange={e => setInvestorId(e.target.value)}>
            <option value="">All investors (platform)</option>
            {investors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        ) : null}
      >
        <ErrorBanner>{err}</ErrorBanner>
        {c && (
          <Cards cols={6}>
            <StatCard label="Documents Available" value={c.documentsAvailable} />
            <StatCard label="Reports" value={c.reportsGenerated} sub="report types" />
            <StatCard label="Total Investments" value={fmt(c.totalInvestments)} />
            <StatCard label="Active Projects" value={c.activeProjects} />
            <StatCard label="Total Revenue" value={fmt(c.totalRevenue)} />
            <StatCard label="Total Returns" value={fmt(c.totalReturns)} />
          </Cards>
        )}
      </Section>

      <Section title="Reports & Statements" subtitle="Generated on demand from live ledger data.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(overview?.sections || []).map(s => (
            <div key={s.key} className="rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-slate-900">{s.title}</div>
                <div className="text-xs text-slate-500">
                  {s.kind === 'document'
                    ? `${s.count} document${s.count === 1 ? '' : 's'}`
                    : 'Generated report'}
                </div>
              </div>
              {s.key === 'investor-statements'
                ? <Button variant="ghost" onClick={downloadStatement}>Download PDF</Button>
                : <Badge kind={s.available ? 'paid' : 'pending'}>{s.available ? 'Available' : 'None'}</Badge>}
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Documents"
        subtitle={`${docs.length} document(s) available to you`}
        action={
          <Toolbar>
            <Input placeholder="Search…" value={filter.q} onChange={e => setFilter({ ...filter, q: e.target.value })} />
            <Select value={filter.category} onChange={e => setFilter({ ...filter, category: e.target.value })}>
              <option value="">All categories</option>
              {(overview?.categories || []).map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </Select>
          </Toolbar>
        }
      >
        <div className="flex flex-wrap gap-3 mb-3">
          <Field label="From" className="w-40"><Input type="date" value={filter.from} onChange={e => setFilter({ ...filter, from: e.target.value })} /></Field>
          <Field label="To" className="w-40"><Input type="date" value={filter.to} onChange={e => setFilter({ ...filter, to: e.target.value })} /></Field>
        </div>
        {docs.length === 0 ? (
          <Empty>No documents available.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr><th>Title</th><th>Category</th><th>Date</th><th className="!text-right">Action</th></tr>
              </thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id}>
                    <td className="font-medium text-slate-900">{d.title}{d.description && <div className="text-xs text-slate-500">{d.description}</div>}</td>
                    <td className="text-slate-600">{d.category}</td>
                    <td className="text-slate-500 whitespace-nowrap">{new Date(d.createdAt).toLocaleDateString()}</td>
                    <td className="text-right"><Button variant="ghost" onClick={() => download(d)}>Download</Button></td>
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
