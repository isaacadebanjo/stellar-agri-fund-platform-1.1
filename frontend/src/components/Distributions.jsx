import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Section, StatCard, Cards, Button, Input, Select, Field,
  Badge, TableWrap, Empty, ErrorBanner, Money, fmt
} from './ui.jsx';

export default function Distributions({ refreshKey, onChange }) {
  const [projects, setProjects] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [feePct, setFeePct] = useState(10);
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([api.projects.list(), api.distributions.list()])
    .then(([pr, d]) => {
      setProjects(pr);
      setDistributions(d);
      setProjectId(curr => curr || pr[0]?.id || '');
    })
    .catch(e => setErr(e.message));

  useEffect(() => { load(); }, [refreshKey]);

  useEffect(() => {
    if (!projectId) { setPreview(null); return; }
    api.distributions.preview(projectId, feePct)
      .then(setPreview)
      .catch(e => { setPreview(null); setErr(e.message); });
  }, [projectId, feePct, refreshKey]);

  async function generate() {
    if (!projectId) return;
    setBusy(true);
    try {
      await api.distributions.generate(projectId, feePct);
      setErr('');
      await load(); onChange?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function markPaid(id) {
    try {
      await api.distributions.markPaid(id);
      await load(); onChange?.();
    } catch (e) { alert(e.message); }
  }

  return (
    <>
      <Section
        title="Distribution Engine"
        subtitle="Calculates each investor's share of project profit. No on-chain transfer — records only."
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Project">
            <Select value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="" disabled>Select project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Platform fee %">
            <Input type="number" min="0" max="100" step="0.5"
                   value={feePct} onChange={e => setFeePct(Number(e.target.value))} />
          </Field>
          <Field label="&nbsp;">
            <Button onClick={generate} disabled={busy || !preview || preview.netProfit <= 0}>
              Generate distributions
            </Button>
          </Field>
        </div>
        <div className="mt-3"><ErrorBanner>{err}</ErrorBanner></div>
      </Section>

      {preview && (
        <>
          <Cards cols={5}>
            <StatCard label="Revenue" value={fmt(preview.revenue)} />
            <StatCard label="Payouts" value={fmt(preview.payouts)} />
            <StatCard label="Gross Profit" value={fmt(preview.grossProfit)} />
            <StatCard label={`Platform Fee (${preview.platformFeePercent}%)`} value={fmt(preview.platformFee)} />
            <StatCard label="Net Profit" value={fmt(preview.netProfit)} sub="distributable" accent="PREVIEW" />
          </Cards>

          <Section title={`Preview · ${preview.projectName}`} subtitle="Who would receive what if you generated now">
            {preview.investors.length === 0 ? (
              <Empty>No funded investors yet.</Empty>
            ) : (
              <TableWrap>
                <table>
                  <thead>
                    <tr>
                      <th>Investor ID</th>
                      <th className="!text-right">Invested</th>
                      <th className="!text-right">Share %</th>
                      <th className="!text-right">Estimated Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.investors.map(s => (
                      <tr key={s.investorId}>
                        <td className="mono">{s.investorId}</td>
                        <td className="text-right tabular-nums">{fmt(s.invested)}</td>
                        <td className="text-right tabular-nums">{s.sharePercent}%</td>
                        <td className="text-right"><Money value={s.estimatedReturn} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Section>
        </>
      )}

      <Section title="Distribution Records" subtitle={`${distributions.length} total`}>
        {distributions.length === 0 ? (
          <Empty>No distributions generated yet.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Investor</th>
                  <th>Project</th>
                  <th className="!text-right">Share %</th>
                  <th className="!text-right">Amount</th>
                  <th>Status</th>
                  <th className="!text-right"></th>
                </tr>
              </thead>
              <tbody>
                {distributions.map(d => (
                  <tr key={d.id}>
                    <td className="text-slate-500 whitespace-nowrap">{new Date(d.timestamp).toLocaleString()}</td>
                    <td className="font-medium text-slate-900">{d.investorName}</td>
                    <td>{d.projectName}</td>
                    <td className="text-right tabular-nums">{d.sharePercent}%</td>
                    <td className="text-right"><Money value={d.amount} /></td>
                    <td><Badge kind={d.status}>{d.status}</Badge></td>
                    <td className="text-right">
                      {d.status !== 'paid' && (
                        <Button variant="ghost" onClick={() => markPaid(d.id)}>Mark paid</Button>
                      )}
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
