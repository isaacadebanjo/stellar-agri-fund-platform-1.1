import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { api } from '../api.js';
import { Section, StatCard, Cards, Field, Input, Button, Empty, ErrorBanner, fmt } from './ui.jsx';

const SCENARIO_COLORS = { best: '#10b981', expected: '#0ea5e9', worst: '#f43f5e' };

export default function RoiSimulator() {
  const [baseline, setBaseline] = useState(null);
  const [form, setForm] = useState({ investmentAmount: 10000, durationMonths: 12, expectedYieldPercent: 12 });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.simulator.baseline()
      .then(b => {
        setBaseline(b);
        setForm(f => ({ ...f, expectedYieldPercent: b.suggestedYieldPercent || f.expectedYieldPercent }));
      })
      .catch(() => { /* baseline is best-effort; the form still works */ });
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function simulate(e) {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      const data = await api.simulator.roi({
        investmentAmount: Number(form.investmentAmount),
        durationMonths: Number(form.durationMonths),
        expectedYieldPercent: Number(form.expectedYieldPercent)
      });
      setResult(data);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  const expected = result?.scenarios?.find(s => s.key === 'expected');

  return (
    <>
      <Section
        title="Investor ROI Simulator"
        subtitle="Model projected returns across best, expected and worst-case scenarios."
      >
        <ErrorBanner>{err}</ErrorBanner>
        <form onSubmit={simulate} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Field label="Investment Amount (XLM)">
            <Input type="number" min="0" step="100" value={form.investmentAmount} onChange={set('investmentAmount')} required />
          </Field>
          <Field label="Duration (months)">
            <Input type="number" min="1" step="1" value={form.durationMonths} onChange={set('durationMonths')} required />
          </Field>
          <Field label="Expected Annual Yield (%)">
            <Input type="number" min="0" step="0.5" value={form.expectedYieldPercent} onChange={set('expectedYieldPercent')} required />
          </Field>
          <Button type="submit" disabled={loading}>{loading ? 'Calculating…' : 'Run Simulation'}</Button>
        </form>
        {baseline && (
          <p className="mt-3 text-[11px] text-slate-400">
            Platform baseline · realised ROI {baseline.platformRoiPercent}% · avg yield performance {baseline.avgYieldPerformancePercent}% ·
            suggested yield {baseline.suggestedYieldPercent}% · platform fee {baseline.platformFeePercent}%
          </p>
        )}
      </Section>

      {result && (
        <>
          <Section title="Projected Outcomes" subtitle={`On ${fmt(result.inputs.investmentAmount)} over ${result.inputs.durationMonths} months.`}>
            {expected && (
              <Cards cols={4}>
                <StatCard label="Projected Revenue (expected)" value={fmt(expected.projectedRevenue)} sub="gross income generated" />
                <StatCard label="Projected Returns (expected)" value={fmt(expected.projectedReturns)} sub={`after ${result.inputs.platformFeePercent}% fee`} />
                <StatCard label="Projected ROI (expected)" value={`${expected.projectedRoiPercent}%`} sub={`${expected.annualizedRoiPercent}% annualized`} />
                <StatCard label="Ending Value (expected)" value={fmt(expected.endingValue)} sub="principal + net returns" />
              </Cards>
            )}
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={result.scenarios} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Bar dataKey="projectedReturns" name="Net Returns" radius={[4, 4, 0, 0]}>
                  {result.scenarios.map((s) => <Cell key={s.key} fill={SCENARIO_COLORS[s.key]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Section>

          <Section title="Scenario Detail" subtitle="Risk scenario impact on returns.">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th className="text-right">Effective Yield</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Platform Fee</th>
                    <th className="text-right">Net Returns</th>
                    <th className="text-right">ROI</th>
                    <th className="text-right">Ending Value</th>
                  </tr>
                </thead>
                <tbody>
                  {result.scenarios.map(s => (
                    <tr key={s.key}>
                      <td className="font-medium" style={{ color: SCENARIO_COLORS[s.key] }}>{s.label}</td>
                      <td className="text-right tabular-nums">{s.effectiveYieldPercent}%</td>
                      <td className="text-right tabular-nums">{fmt(s.projectedRevenue)}</td>
                      <td className="text-right tabular-nums">{fmt(s.platformFee)}</td>
                      <td className="text-right tabular-nums">{fmt(s.projectedReturns)}</td>
                      <td className="text-right tabular-nums">{s.projectedRoiPercent}%</td>
                      <td className="text-right tabular-nums">{fmt(s.endingValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      {!result && <Empty>Enter your parameters above and run the simulation to see projected returns.</Empty>}
    </>
  );
}
