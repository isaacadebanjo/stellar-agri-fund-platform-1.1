import React, { useEffect, useState } from 'react';
import { api, downloadBlob } from '../api.js';
import {
  Section, StatCard, Cards, Button, Select, Field, Badge, TableWrap, Empty, ErrorBanner, Toolbar, fmt
} from './ui.jsx';

const now = new Date();
const KINDS = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'board', label: 'Board' }
];

export default function BoardReports({ refreshKey }) {
  const [kind, setKind] = useState('monthly');
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [quarter, setQuarter] = useState(Math.floor(now.getUTCMonth() / 3) + 1);
  const [report, setReport] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const params = () => kind === 'monthly' ? { year, month } : kind === 'quarterly' ? { year, quarter } : {};

  const load = () => {
    setErr('');
    api.boardReports.json(kind, params()).then(setReport).catch(e => setErr(e.message));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, kind, year, month, quarter]);

  async function dl(format) {
    setBusy(true);
    try {
      const blob = await api.boardReports.downloadBlob(kind, { ...params(), format });
      downloadBlob(`${kind}-report.${format === 'xlsx' ? 'xlsx' : 'pdf'}`, blob);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const m = report?.metrics || {};
  const years = Array.from({ length: 6 }, (_, i) => now.getUTCFullYear() - i);

  return (
    <>
      <Section
        title="Board & Investor Reporting"
        subtitle="Professional monthly, quarterly, and board reports — export to PDF or Excel."
        action={
          <Toolbar>
            <Select value={kind} onChange={e => setKind(e.target.value)}>
              {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </Select>
            {kind !== 'board' && (
              <Select value={year} onChange={e => setYear(Number(e.target.value))}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </Select>
            )}
            {kind === 'monthly' && (
              <Select value={month} onChange={e => setMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(mo => <option key={mo} value={mo}>{`M${mo}`}</option>)}
              </Select>
            )}
            {kind === 'quarterly' && (
              <Select value={quarter} onChange={e => setQuarter(Number(e.target.value))}>
                {[1, 2, 3, 4].map(q => <option key={q} value={q}>{`Q${q}`}</option>)}
              </Select>
            )}
            <Button variant="ghost" disabled={busy} onClick={() => dl('pdf')}>PDF</Button>
            <Button variant="ghost" disabled={busy} onClick={() => dl('xlsx')}>Excel</Button>
          </Toolbar>
        }
      >
        <ErrorBanner>{err}</ErrorBanner>
        {!report ? <Empty>Loading report…</Empty> : (
          <div className="text-sm text-slate-700 mb-2 font-medium">{report.title}</div>
        )}

        {report?.type === 'monthly' && (
          <Cards cols={3}>
            <StatCard label="Capital Deployed" value={fmt(m.capitalDeployed)} />
            <StatCard label="Revenue Generated" value={fmt(m.revenueGenerated)} />
            <StatCard label="Profit Generated" value={fmt(m.profitGenerated)} />
            <StatCard label="Investor Returns" value={fmt(m.investorReturns)} />
            <StatCard label="Treasury Balance" value={fmt(m.treasuryBalance)} />
            <StatCard label="Yield Performance" value={`${m.yield?.performancePercent ?? 0}%`} sub={`${m.yield?.actual ?? 0} / ${m.yield?.expected ?? 0}`} />
          </Cards>
        )}

        {report?.type === 'quarterly' && (
          <>
            <Cards cols={4}>
              <StatCard label="Overall ROI" value={`${m.overallRoiPercent}%`} />
              <StatCard label="Capital Utilization" value={`${m.capitalUtilizationPercent}%`} />
              <StatCard label="Active Projects" value={`${m.activeProjects}/${m.totalProjects}`} />
              <StatCard label="Yield Performance" value={`${m.yieldPerformancePercent}%`} />
            </Cards>
            <TableWrap>
              <table>
                <thead><tr><th>Project</th><th className="!text-right">Allocated</th><th className="!text-right">Revenue</th><th className="!text-right">Profit</th><th className="!text-right">ROI</th></tr></thead>
                <tbody>
                  {(report.projectPerformance || []).map(p => (
                    <tr key={p.projectId}>
                      <td className="font-medium text-slate-900">{p.name}</td>
                      <td className="text-right tabular-nums">{fmt(p.allocated)}</td>
                      <td className="text-right tabular-nums">{fmt(p.revenue)}</td>
                      <td className="text-right tabular-nums">{fmt(p.profit)}</td>
                      <td className="text-right tabular-nums">{p.roiPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </>
        )}

        {report?.type === 'board' && (
          <>
            <Cards cols={4}>
              <StatCard label="Capital Deployed" value={fmt(report.executiveSummary?.capitalDeployed)} />
              <StatCard label="Total Revenue" value={fmt(report.executiveSummary?.totalRevenue)} />
              <StatCard label="Treasury Balance" value={fmt(report.financialMetrics?.treasuryBalance)} />
              <StatCard label="Capital Utilization" value={`${report.financialMetrics?.capitalUtilizationPercent ?? 0}%`} />
              <StatCard label="Pending Approvals" value={report.governanceMetrics?.pendingApprovals ?? 0} />
              <StatCard label="Milestone Completion" value={`${report.governanceMetrics?.milestoneCompletionRate ?? 0}%`} />
              <StatCard label="Active Contracts" value={report.governanceMetrics?.activeContracts ?? 0} />
              <StatCard label="Outstanding Payments" value={fmt(report.financialMetrics?.outstandingPayments)} />
            </Cards>
            <div className="text-sm font-medium text-slate-800 mb-2">Risk Indicators</div>
            {(report.riskIndicators || []).length === 0 ? (
              <Empty>No active risk indicators.</Empty>
            ) : (
              <div className="space-y-1.5">
                {report.riskIndicators.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Badge kind={r.level === 'high' ? 'cancelled' : r.level === 'medium' ? 'pending' : 'neutral'}>{r.level}</Badge>
                    <span className="text-sm text-slate-700">{r.label}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Section>
    </>
  );
}
