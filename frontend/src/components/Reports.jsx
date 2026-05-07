import React, { useEffect, useState } from 'react';
import { api, downloadJson } from '../api.js';
import {
  Section, Button, Badge, TableWrap, Empty, ErrorBanner, Money, fmt
} from './ui.jsx';

function ExportBtn({ data, filename, disabled }) {
  return (
    <Button variant="ghost" onClick={() => downloadJson(filename, data)} disabled={disabled}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
           strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <path d="M12 4v12" /><path d="M6 12l6 6 6-6" /><path d="M4 20h16" />
      </svg>
      Export JSON
    </Button>
  );
}

export default function Reports({ refreshKey }) {
  const [investors, setInvestors] = useState([]);
  const [projects, setProjects] = useState([]);
  const [revVsPay, setRevVsPay] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([
      api.reports.investors(),
      api.reports.projects(),
      api.reports.revenueVsPayout()
    ])
      .then(([i, p, rp]) => {
        setInvestors(i); setProjects(p); setRevVsPay(rp);
        setErr('');
      })
      .catch(e => setErr(e.message));
  }, [refreshKey]);

  if (err) return <ErrorBanner>{err}</ErrorBanner>;

  return (
    <>
      <Section
        title="Investor Summary"
        subtitle="Per-investor totals across the platform"
        action={<ExportBtn data={investors} filename="investor-summary.json" />}
      >
        {investors.length === 0 ? (
          <Empty>No investors yet.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th className="!text-right">Wallet Balance</th>
                  <th className="!text-right">Invested</th>
                  <th className="!text-right">Returns</th>
                  <th className="!text-right">Distributions</th>
                </tr>
              </thead>
              <tbody>
                {investors.map(i => (
                  <tr key={i.investorId}>
                    <td className="font-medium text-slate-900">{i.name}</td>
                    <td className="text-slate-500">{i.email || '—'}</td>
                    <td className="text-right tabular-nums">{fmt(i.walletBalance)}</td>
                    <td className="text-right tabular-nums">{fmt(i.invested)}</td>
                    <td className="text-right"><Money value={i.returns} /></td>
                    <td className="text-right tabular-nums">{i.distributionsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>

      <Section
        title="Project Summary"
        subtitle="Allocation, payouts, revenue, profit and distributed amounts per project"
        action={<ExportBtn data={projects} filename="project-summary.json" />}
      >
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
                  <th className="!text-right">Allocated</th>
                  <th className="!text-right">Paid Out</th>
                  <th className="!text-right">Revenue</th>
                  <th className="!text-right">Profit</th>
                  <th className="!text-right">Distributed</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.projectId}>
                    <td className="font-medium text-slate-900">{p.name}</td>
                    <td>{p.cropType || <span className="text-slate-400">—</span>}</td>
                    <td><Badge kind={p.status}>{p.status}</Badge></td>
                    <td className="text-right tabular-nums">{fmt(p.allocated)}</td>
                    <td className="text-right tabular-nums">{fmt(p.paidOut)}</td>
                    <td className="text-right tabular-nums">{fmt(p.revenue)}</td>
                    <td className="text-right"><Money value={p.profit} signed /></td>
                    <td className="text-right tabular-nums">{fmt(p.distributed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>

      <Section
        title="Revenue vs Payout"
        subtitle="Net = revenue − payouts, by project"
        action={<ExportBtn data={revVsPay} filename="revenue-vs-payout.json" disabled={!revVsPay} />}
      >
        {!revVsPay ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="!text-right">Revenue</th>
                  <th className="!text-right">Payouts</th>
                  <th className="!text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {revVsPay.perProject.map(r => (
                  <tr key={r.projectId}>
                    <td>{r.name}</td>
                    <td className="text-right tabular-nums">{fmt(r.revenue)}</td>
                    <td className="text-right tabular-nums">{fmt(r.payouts)}</td>
                    <td className="text-right"><Money value={r.net} signed /></td>
                  </tr>
                ))}
                <tr className="bg-slate-50/60">
                  <td className="font-semibold text-slate-900">Total</td>
                  <td className="text-right font-semibold tabular-nums">{fmt(revVsPay.totals.revenue)}</td>
                  <td className="text-right font-semibold tabular-nums">{fmt(revVsPay.totals.payouts)}</td>
                  <td className="text-right font-semibold"><Money value={revVsPay.totals.net} signed /></td>
                </tr>
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>
    </>
  );
}
