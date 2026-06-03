import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Section, StatCard, Cards, Badge, Empty, ErrorBanner, fmt } from './ui.jsx';
import HistoricalFlows from './HistoricalFlows.jsx';

// Coloured score bar (0–100).
function ScoreBar({ label, value, sub }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const color = v >= 75 ? 'bg-emerald-500' : v >= 50 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{v}<span className="text-sm text-slate-400">/100</span></div>
      <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
      </div>
      {sub && <div className="stat-sub mt-1">{sub}</div>}
    </div>
  );
}

const healthKind = (h) => (h === 'Healthy' ? 'paid' : h === 'Critical' ? 'cancelled' : 'pending');

export default function ExecutiveDashboard({ refreshKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true);
    api.executive.overview()
      .then(d => { setData(d); setErr(''); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading && !data) {
    return <Section title="Executive Governance Dashboard"><Empty>Loading…</Empty></Section>;
  }

  return (
    <>
      <Section
        title="Executive Governance Dashboard"
        subtitle="Institutional-readiness signals, scores, and risk at a glance."
      >
        <ErrorBanner>{err}</ErrorBanner>
        {data && (
          <>
            <Cards cols={4}>
              <StatCard label="Pending Approvals" value={data.pendingApprovals} sub="awaiting sign-off" accent={data.pendingApprovals ? 'ACTION' : undefined} />
              <StatCard label="Capital Utilization" value={`${data.capitalUtilizationPercent}%`} sub="allocated vs invested" />
              <StatCard label="Treasury Health" value={<Badge kind={healthKind(data.treasuryHealth)}>{data.treasuryHealth}</Badge>} sub={fmt(data.availableLiquidity) + ' available'} />
              <StatCard label="Active Contracts" value={data.activeContracts} sub={`${data.buyerVerification.verified}/${data.buyerVerification.total} buyers verified`} />
            </Cards>

            <Cards cols={3}>
              <ScoreBar label="Investor Confidence Score" value={data.investorConfidenceScore} sub="composite readiness" />
              <ScoreBar label="Governance Score" value={data.governanceScore} sub="approvals · milestones · KYC" />
              <ScoreBar label="Reporting Compliance" value={data.reportingComplianceScore} sub="document coverage" />
            </Cards>

            <Cards cols={3}>
              <StatCard label="Outstanding Payments" value={fmt(data.outstandingPayments)} sub="unpaid invoices" />
              <StatCard label="ROI" value={`${data.roiPercent}%`} sub={`${fmt(data.totalDistributed)} distributed`} />
              <StatCard label="Buyer Verification" value={`${data.buyerVerification.rate}%`} sub={`${data.buyerVerification.verified} of ${data.buyerVerification.total}`} />
            </Cards>
          </>
        )}
      </Section>

      <Section title="Risk Alerts" subtitle="Issues that may need executive attention.">
        {!data?.riskAlerts?.length ? (
          <Empty>No active risk alerts. 🎉</Empty>
        ) : (
          <div className="space-y-1.5">
            {data.riskAlerts.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
                <Badge kind={r.level === 'high' ? 'cancelled' : r.level === 'medium' ? 'pending' : 'neutral'}>{r.level}</Badge>
                <span className="text-sm text-slate-700">{r.label}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <HistoricalFlows data={data?.trends} loading={loading} />
    </>
  );
}
