import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Section, StatCard, Cards, Empty, ErrorBanner, fmt } from './ui.jsx';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';

const pct = (n) => `${(n ?? 0).toFixed(1)}%`;
const num = (n) => (n ?? 0).toLocaleString();

export default function KpiDashboard({ refreshKey }) {
  const [kpi, setKpi] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.kpi().then(setKpi).catch(e => setErr(e.message));
  }, [refreshKey]);

  if (err) return <ErrorBanner>{err}</ErrorBanner>;
  if (!kpi) return <Section title="Operational KPIs"><div className="h-40 bg-slate-100 rounded animate-pulse" /></Section>;

  return (
    <>
      <Cards cols={4}>
        <StatCard label="Hectares Under Cultivation" value={num(kpi.totalHectares)} sub={`${kpi.activeProjects} active / ${kpi.projectCount} projects`} />
        <StatCard label="Capital Utilization" value={pct(kpi.capitalUtilizationPercent)} sub={`${fmt(kpi.totalAllocated)} allocated`} />
        <StatCard label="Investor ROI" value={pct(kpi.investorRoiPercent)} sub={`${fmt(kpi.totalDistributed)} distributed`} />
        <StatCard label="Gross Margin" value={pct(kpi.grossMarginPercent)} sub={`${fmt(kpi.grossProfit)} gross profit`} accent={kpi.grossMarginPercent < 0 ? 'RISK' : undefined} />
      </Cards>

      <Cards cols={4}>
        <StatCard label="Yield / Hectare" value={num(kpi.yieldPerHectare)} sub="actual yield per ha" />
        <StatCard label="Revenue / Hectare" value={fmt(kpi.revenuePerHectare)} sub="revenue per ha" />
        <StatCard label="Cost / Hectare" value={fmt(kpi.costPerHectare)} sub="payouts per ha" />
        <StatCard label="Profit Margin" value={pct(kpi.profitMarginPercent)} sub={`${fmt(kpi.netProfit)} net profit`} accent={kpi.profitMarginPercent < 0 ? 'RISK' : undefined} />
      </Cards>

      <Section title="Revenue, Cost & Profit by Project" subtitle="Per-project operational performance">
        {(!kpi.byProject || kpi.byProject.length === 0) ? (
          <Empty>No projects yet.</Empty>
        ) : (
          <div className="h-80 -mx-2">
            <ResponsiveContainer>
              <BarChart data={kpi.byProject} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false}
                       tickFormatter={(v) => `${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v} XLM`} />
                <Tooltip formatter={(v) => fmt(v)} cursor={{ fill: '#f1f5f9' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name="Revenue" fill="#047857" radius={[6, 6, 0, 0]} />
                <Bar dataKey="cost" name="Cost" fill="#dc2626" radius={[6, 6, 0, 0]} />
                <Bar dataKey="profit" name="Profit" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>
    </>
  );
}
