import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { api } from '../api.js';
import { Section, StatCard, Cards, Badge, Empty, ErrorBanner, fmt } from './ui.jsx';

const levelKind = (l) => (l === 'high' ? 'cancelled' : l === 'medium' ? 'pending' : 'paid');
const scoreColor = (s) => (s >= 67 ? 'bg-rose-500' : s >= 34 ? 'bg-amber-500' : 'bg-emerald-500');

// Risk score gauge bar (0–100, higher = riskier).
function RiskBar({ label, score, level, sub }) {
  const s = Math.max(0, Math.min(100, score || 0));
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className="stat-label">{label}</div>
        {level && <Badge kind={levelKind(level)}>{level}</Badge>}
      </div>
      <div className="stat-value">{s}<span className="text-sm text-slate-400">/100</span></div>
      <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${scoreColor(s)}`} style={{ width: `${s}%` }} />
      </div>
      {sub && <div className="stat-sub mt-1">{sub}</div>}
    </div>
  );
}

// Concentration breakdown: ranked exposure bars for the top counterparties.
function ConcentrationCard({ title, data }) {
  if (!data) return null;
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <Badge kind={levelKind(data.level)}>{data.level}</Badge>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-semibold tabular-nums text-slate-900">{data.score}</span>
        <span className="text-xs text-slate-400">/100 · top {data.topShare}% · {data.count} counterparties</span>
      </div>
      {!data.breakdown?.length ? (
        <p className="text-xs text-slate-400">No exposure recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {data.breakdown.slice(0, 5).map((b) => (
            <div key={b.id}>
              <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                <span className="truncate pr-2">{b.label}</span>
                <span className="tabular-nums">{b.sharePercent}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${b.sharePercent}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Likelihood × Impact heatmap. Each category is plotted on a 3×3 grid.
function Heatmap({ cells }) {
  if (!cells?.length) return null;
  const cellBg = (likelihood, impact) => {
    const sev = likelihood * impact; // 1..9
    if (sev >= 6) return 'bg-rose-100 ring-rose-200';
    if (sev >= 3) return 'bg-amber-100 ring-amber-200';
    return 'bg-emerald-100 ring-emerald-200';
  };
  // Grid: rows = impact (3 high → 1 low), cols = likelihood (1 → 3).
  const impacts = [3, 2, 1];
  const likelihoods = [1, 2, 3];
  const labelFor = (l) => ({ 1: 'Low', 2: 'Med', 3: 'High' })[l];
  const at = (l, i) => cells.filter(c => c.likelihood === l && c.impact === i);
  return (
    <div className="overflow-x-auto">
      <div className="inline-grid" style={{ gridTemplateColumns: 'auto repeat(3, minmax(120px, 1fr))' }}>
        <div />
        {likelihoods.map(l => (
          <div key={l} className="text-center text-[11px] font-medium text-slate-500 pb-1">
            Likelihood: {labelFor(l)}
          </div>
        ))}
        {impacts.map(i => (
          <React.Fragment key={i}>
            <div className="flex items-center text-[11px] font-medium text-slate-500 pr-2 justify-end">
              Impact: {labelFor(i)}
            </div>
            {likelihoods.map(l => (
              <div key={`${l}-${i}`} className={`m-1 rounded-lg ring-1 ring-inset p-2 min-h-[64px] ${cellBg(l, i)}`}>
                {at(l, i).map(c => (
                  <div key={c.key} className="text-[11px] font-medium text-slate-700 leading-tight mb-0.5">
                    {c.label} <span className="text-slate-500">({c.score})</span>
                  </div>
                ))}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export default function RiskDashboard({ refreshKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true);
    api.risk.overview()
      .then(d => { setData(d); setErr(''); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading && !data) {
    return <Section title="Risk Management"><Empty>Loading…</Empty></Section>;
  }

  const c = data?.categories;

  return (
    <>
      <Section
        title="Risk Management"
        subtitle="Concentration, liquidity, payment and operational risk — scored, mapped and trended."
        action={data && <Badge kind={levelKind(data.overallRiskLevel)}>Overall: {data.overallRiskScore}/100 · {data.overallRiskLevel}</Badge>}
      >
        <ErrorBanner>{err}</ErrorBanner>
        {data && (
          <Cards cols={3}>
            <RiskBar label="Liquidity Risk" score={c.liquidityRisk.score} level={c.liquidityRisk.level}
              sub={`${fmt(c.liquidityRisk.availableLiquidity)} available · ${c.liquidityRisk.treasuryHealth}`} />
            <RiskBar label="Payment Delay Risk" score={c.paymentDelayRisk.score} level={c.paymentDelayRisk.level}
              sub={`${c.paymentDelayRisk.overdueCount} overdue · ${fmt(c.paymentDelayRisk.overdueAmount)} · ~${c.paymentDelayRisk.avgDaysOverdue}d`} />
            <RiskBar label="Operational Risk" score={c.operationalRisk.score} level={c.operationalRisk.level}
              sub={`Yield ${c.operationalRisk.yieldPerformancePercent}% · ${c.operationalRisk.failedTransactions} failed tx`} />
          </Cards>
        )}
      </Section>

      {data && (
        <Section title="Concentration Risk" subtitle="Single points of failure across revenue, buyers and projects.">
          <Cards cols={3}>
            <ConcentrationCard title="Revenue Concentration" data={c.revenueConcentration} />
            <ConcentrationCard title="Buyer Concentration" data={c.buyerConcentration} />
            <ConcentrationCard title="Project Concentration" data={c.projectConcentration} />
          </Cards>
        </Section>
      )}

      {data && (
        <Section title="Risk Heatmap" subtitle="Likelihood × impact across all risk categories.">
          <Heatmap cells={data.heatmap} />
        </Section>
      )}

      <Section title="Risk Trends" subtitle="Monthly risk indicators over the last 6 months.">
        {!data?.trends?.length ? (
          <Empty>Not enough history to plot trends yet.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.trends} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="overallRisk" stroke="#e11d48" strokeWidth={3} dot={false} name="Overall Risk" />
              <Line type="monotone" dataKey="revenueConcentration" stroke="#f59e0b" strokeWidth={2} dot={false} name="Revenue Concentration" />
              <Line type="monotone" dataKey="paymentDelayRisk" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Payment Delay" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Section>
    </>
  );
}
