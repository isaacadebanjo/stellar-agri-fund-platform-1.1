import React, { useEffect, useState } from 'react';
import {
  ComposedChart, Bar, Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { api } from '../api.js';
import { Section, StatCard, Cards, Badge, Empty, ErrorBanner, fmt } from './ui.jsx';
import HistoricalFlows from './HistoricalFlows.jsx';

const readinessKind = (band) =>
  band === 'Investment Ready' ? 'paid' : band === 'Developing' ? 'pending' : 'neutral';

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
            {data.executiveSummary && (
              <div className="mb-5 rounded-xl border border-slate-200 bg-gradient-to-br from-brand-50/60 to-white p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-sm font-semibold text-slate-900">Executive Summary</h3>
                  {data.readinessBand && (
                    <Badge kind={readinessKind(data.readinessBand)}>
                      {data.readinessBand} · {data.investmentReadinessScore}/100
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{data.executiveSummary.headline}</p>
                {data.executiveSummary.highlights?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.executiveSummary.highlights.map((h, i) => (
                      <span key={i} className="text-[11px] font-medium text-slate-600 bg-white ring-1 ring-slate-200 rounded-full px-2.5 py-1">{h}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Cards cols={4}>
              <StatCard label="Investment Readiness" value={`${data.investmentReadinessScore ?? '—'}`} sub={data.readinessBand} accent="SCORE" />
              <StatCard label="Capital Deployed" value={fmt(data.capitalDeployed ?? 0)} sub={`${data.capitalUtilizationPercent}% utilization`} />
              <StatCard label="Contracted Revenue" value={fmt(data.contractedRevenue ?? 0)} sub={`${data.activeContracts} active contracts`} />
              <StatCard label="Treasury Health" value={<Badge kind={healthKind(data.treasuryHealth)}>{data.treasuryHealth}</Badge>} sub={fmt(data.availableLiquidity) + ' available'} />
            </Cards>

            <Cards cols={4}>
              <StatCard label="Pending Approvals" value={data.pendingApprovals} sub="awaiting sign-off" accent={data.pendingApprovals ? 'ACTION' : undefined} />
              <StatCard label="Capital Utilization" value={`${data.capitalUtilizationPercent}%`} sub="allocated vs invested" />
              <StatCard label="Total Distributed" value={fmt(data.totalDistributed)} sub="to investors" />
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

      {data?.monthlyTrends?.length > 0 && (
        <Section title="Revenue & Profit Trends" subtitle="Monthly revenue and profit over the last 6 months.">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data.monthlyTrends} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend />
              <Bar dataKey="revenue" fill="#10b981" name="Revenue" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="profit" stroke="#0ea5e9" strokeWidth={3} dot={false} name="Profit" />
            </ComposedChart>
          </ResponsiveContainer>
        </Section>
      )}

      {data?.monthlyTrends?.length > 0 && (
        <Section title="Yield Performance Trend" subtitle="Actual vs expected yield, by harvest month (%).">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.monthlyTrends} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis domain={[0, 'auto']} tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Line type="monotone" dataKey="yieldPerformance" stroke="#047857" strokeWidth={2.5} dot name="Yield Performance" />
            </LineChart>
          </ResponsiveContainer>
        </Section>
      )}

      <HistoricalFlows data={data?.trends} loading={loading} />
    </>
  );
}
