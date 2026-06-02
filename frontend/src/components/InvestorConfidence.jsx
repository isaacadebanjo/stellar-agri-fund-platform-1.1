import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Section, StatCard, Cards, Empty, ErrorBanner, fmt } from './ui.jsx';

const pct = (n) => `${(n ?? 0).toFixed(1)}%`;

// 0–100 composite readiness/governance score with a color band.
function ScoreBadge({ score }) {
  const band = score >= 75 ? 'emerald' : score >= 50 ? 'amber' : 'rose';
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    rose: 'bg-rose-50 text-rose-700 ring-rose-200'
  }[band];
  const label = score >= 75 ? 'Strong' : score >= 50 ? 'Developing' : 'Early';
  return (
    <div className={`rounded-xl ring-1 ring-inset px-6 py-5 flex items-center justify-between ${colors}`}>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider opacity-80">Governance & Readiness Score</div>
        <div className="text-4xl font-bold mt-1">{score}<span className="text-lg font-medium opacity-70">/100</span></div>
      </div>
      <div className="text-sm font-semibold">{label}</div>
    </div>
  );
}

export default function InvestorConfidence({ refreshKey }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.investorConfidence().then(setData).catch(e => setErr(e.message));
  }, [refreshKey]);

  if (err) return <ErrorBanner>{err}</ErrorBanner>;
  if (!data) return <Section title="Investor Confidence"><div className="h-40 bg-slate-100 rounded animate-pulse" /></Section>;

  return (
    <>
      <Section
        title="Investor Confidence"
        subtitle="Institutional-readiness signals for due diligence"
      >
        <ScoreBadge score={data.governanceScore} />
      </Section>

      <Cards cols={4}>
        <StatCard label="Capital Deployed" value={fmt(data.capitalDeployed)} sub={`${fmt(data.totalInvested)} invested`} />
        <StatCard label="Capital Remaining" value={fmt(data.capitalRemaining)} sub={`liquidity: ${data.liquidityHealth}`} />
        <StatCard label="Contracted Revenue" value={fmt(data.contractedRevenue)} sub="secured offtake" />
        <StatCard label="Investor ROI" value={pct(data.roiPercent)} sub={`${fmt(data.totalDistributed)} distributed`} />
      </Cards>

      <Cards cols={4}>
        <StatCard label="Buyer Coverage" value={pct(data.buyerCoveragePercent)} sub="projects with offtake" />
        <StatCard label="Verified Buyers" value={`${data.verifiedBuyers}/${data.totalBuyers}`} sub={`${pct(data.buyerVerificationRate)} verified`} />
        <StatCard label="Yield Performance" value={pct(data.yieldPerformancePercent)} sub="actual vs expected" />
        <StatCard label="Payment Collection" value={pct(data.paymentCollectionRate)} sub="invoices collected" />
      </Cards>

      {data.totalBuyers === 0 && data.contractedRevenue === 0 && (
        <Empty>No commercial data yet — add buyers, offtake agreements and yields to populate these signals.</Empty>
      )}
    </>
  );
}
