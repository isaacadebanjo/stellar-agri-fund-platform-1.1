import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { api } from '../api.js';
import { Section, StatCard, Cards, Badge, TableWrap, Empty, ErrorBanner, fmt, Money } from './ui.jsx';
import ActivityWidget from './ActivityWidget.jsx';

export default function Dashboard({ refreshKey }) {
  const [data, setData] = useState(null);
  const [recentTxs, setRecentTxs] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([api.dashboard(), api.transactions.list()])
      .then(([d, txs]) => {
        setData(d);
        setRecentTxs(txs.slice(0, 6));
        setErr('');
      })
      .catch(e => setErr(e.message));
  }, [refreshKey]);

  if (err) return <ErrorBanner>{err}</ErrorBanner>;
  if (!data) return <div className="text-sm text-slate-500">Loading…</div>;

  const trend = data.profitTrend || [];
  const breakdown = data.projectBreakdown || [];

  return (
    <>
      <Cards cols={4}>
        <StatCard label="Total Received" value={fmt(data.totals.received)} sub="from investors" />
        <StatCard label="Treasury Balance" value={fmt(data.totals.treasuryBalance)} sub="XLM on hand (live)" accent="LIVE" />
        <StatCard label="Allocated to Projects" value={fmt(data.totals.allocated)} sub="across all crops" />
        <StatCard label="Paid Out to Farmers" value={fmt(data.totals.paidOut)} sub="cumulative" />
      </Cards>

      <Cards cols={3}>
        <StatCard label="Total Revenue" value={fmt(data.totals.revenue)} sub="from market / buyers" />
        <StatCard label="Estimated Profit" value={fmt(data.totals.estimatedProfit)} sub="revenue − payouts" />
        <StatCard label="Distributions" value={data.counts.distributions ?? 0} sub="profit splits issued" />
      </Cards>

      <Cards cols={5}>
        <StatCard label="Investors" value={data.counts.investors} />
        <StatCard label="Projects" value={data.counts.projects} />
        <StatCard label="Farmers" value={data.counts.farmers ?? 0} />
        <StatCard label="Transactions" value={data.counts.transactions} />
        <StatCard label="Payouts" value={data.counts.payouts} />
      </Cards>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
        <Section title="Profit Trend" subtitle="Cumulative profit since first activity" className="xl:col-span-2 mb-0">
          {trend.length === 0 ? (
            <Empty>Record revenue and payouts to see the trend.</Empty>
          ) : (
            <div className="h-72 -mx-2">
              <ResponsiveContainer>
                <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false}
                         tickFormatter={(v) => `${v >= 1000 ? (v/1000).toFixed(1) + 'k' : v} XLM`} />
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 8 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="cumulativeProfit" name="Cumulative profit" stroke="#047857" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="dailyProfit" name="Daily profit" stroke="#2563eb" strokeWidth={1.75} strokeDasharray="4 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>

        <ActivityWidget refreshKey={refreshKey} />
      </div>

      <Section title="Revenue Breakdown by Project" subtitle="Compare revenue, payouts, and profit per project">
        {breakdown.length === 0 ? (
          <Empty>No projects yet.</Empty>
        ) : (
          <div className="h-80 -mx-2">
            <ResponsiveContainer>
              <BarChart data={breakdown} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false}
                       tickFormatter={(v) => `${v >= 1000 ? (v/1000).toFixed(1) + 'k' : v} XLM`} />
                <Tooltip formatter={(v) => fmt(v)} cursor={{ fill: '#f1f5f9' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name="Revenue" fill="#047857" radius={[6, 6, 0, 0]} />
                <Bar dataKey="payouts" name="Payouts" fill="#dc2626" radius={[6, 6, 0, 0]} />
                <Bar dataKey="profit"  name="Profit"  fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      <Section title="Recent Transactions" subtitle="Latest activity across the platform">
        {recentTxs.length === 0 ? (
          <Empty>No transactions yet.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Stage</th>
                  <th>From</th>
                  <th>To</th>
                  <th className="!text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentTxs.map(t => (
                  <tr key={t.id}>
                    <td className="text-slate-500">{new Date(t.timestamp).toLocaleString()}</td>
                    <td><Badge kind={t.stage}>{t.stage}</Badge></td>
                    <td>{t.senderLabel}</td>
                    <td>{t.receiverLabel}</td>
                    <td className="text-right"><Money value={t.amount} /></td>
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
