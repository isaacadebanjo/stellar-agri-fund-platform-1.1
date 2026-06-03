import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { api } from '../api.js';
import { Section, StatCard, Cards, Badge, Empty, ErrorBanner, fmt } from './ui.jsx';

const HORIZON_LABELS = { 30: '30 Days', 90: '90 Days', 365: '12 Months' };
const healthKind = (h) => (h === 'Healthy' ? 'paid' : h === 'Critical' ? 'cancelled' : 'pending');

export default function TreasuryForecast({ refreshKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [horizon, setHorizon] = useState('90');

  useEffect(() => {
    setLoading(true);
    api.forecast.overview()
      .then(d => { setData(d); setErr(''); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading && !data) {
    return <Section title="Treasury Forecasting"><Empty>Loading…</Empty></Section>;
  }

  const h = data?.horizons?.[horizon];
  const negative = h && h.lowestProjectedBalance < 0;

  return (
    <>
      <Section
        title="Treasury Forecasting"
        subtitle="Forward liquidity projection from contracted inflows and pending obligations."
        action={data && <Badge kind={healthKind(data.current.treasuryHealth)}>{data.current.treasuryHealth}</Badge>}
      >
        <ErrorBanner>{err}</ErrorBanner>
        {data && (
          <Cards cols={3}>
            <StatCard label="Current Treasury" value={fmt(data.current.treasuryBalance)} sub={`${fmt(data.current.availableLiquidity)} available`} />
            <StatCard label="Monthly Revenue Run-Rate" value={fmt(data.monthlyRevenueRunRate)} sub="avg over last 90 days" />
            <StatCard label="Forecast Horizon" value={HORIZON_LABELS[horizon]} sub="select below" />
          </Cards>
        )}
      </Section>

      {data && (
        <Section
          title="Liquidity Forecast"
          subtitle="Projected treasury balance as scheduled cash events settle."
          action={
            <div className="flex gap-1">
              {Object.keys(HORIZON_LABELS).map(k => (
                <button
                  key={k}
                  onClick={() => setHorizon(k)}
                  className={'btn ' + (horizon === k ? 'btn-primary' : 'btn-ghost')}
                >
                  {HORIZON_LABELS[k]}
                </button>
              ))}
            </div>
          }
        >
          {h && (
            <>
              <Cards cols={4}>
                <StatCard label="Expected Inflows" value={fmt(h.expectedInflows)} />
                <StatCard label="Expected Outflows" value={fmt(h.expectedOutflows)} />
                <StatCard label="Net Change" value={fmt(h.netChange)} sub={h.netChange >= 0 ? 'surplus' : 'drawdown'} />
                <StatCard
                  label="Projected Ending Balance"
                  value={fmt(h.endingBalance)}
                  sub={negative ? `⚠ dips to ${fmt(h.lowestProjectedBalance)}` : 'stays positive'}
                  accent={negative ? 'RISK' : undefined}
                />
              </Cards>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={h.series} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => fmt(v)} />
                  <ReferenceLine y={0} stroke="#e11d48" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="balance" stroke="#0ea5e9" strokeWidth={2.5} fill="url(#balFill)" name="Projected Balance" />
                </AreaChart>
              </ResponsiveContainer>
            </>
          )}
        </Section>
      )}

      {data && (
        <Section title="Upcoming Cash Events" subtitle="The most material scheduled inflows and outflows.">
          {!data.schedule?.length ? (
            <Empty>No scheduled cash events.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Type</th><th>Category</th><th>Detail</th><th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.schedule.map((e, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap">{e.date}</td>
                      <td>
                        <Badge kind={e.type === 'inflow' ? 'paid' : 'cancelled'}>{e.type}</Badge>
                      </td>
                      <td>{e.category}</td>
                      <td className="text-slate-500">{e.label}</td>
                      <td className="text-right tabular-nums">{fmt(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.assumptions?.length > 0 && (
            <ul className="mt-4 space-y-1 text-[11px] text-slate-400 list-disc list-inside">
              {data.assumptions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}
