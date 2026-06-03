import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { api } from '../api.js';
import { Section, StatCard, Cards, TableWrap, Empty, ErrorBanner, fmt } from './ui.jsx';

export default function Geography({ refreshKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true);
    api.geography.overview()
      .then(d => { setData(d); setErr(''); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading && !data) {
    return <Section title="Geographic Portfolio"><Empty>Loading…</Empty></Section>;
  }

  const rows = data?.countries || [];
  const chartData = rows.filter(r => r.country !== 'Unassigned');

  return (
    <>
      <Section title="Geographic Portfolio" subtitle="Capital, projects and buyers across operating markets.">
        <ErrorBanner>{err}</ErrorBanner>
        {data && (
          <Cards cols={4}>
            <StatCard label="Operating Markets" value={data.totals.countries} sub="countries with projects" />
            <StatCard label="Total Projects" value={data.totals.projects} />
            <StatCard label="Total Buyers" value={data.totals.buyers} />
            <StatCard label="Capital Deployed" value={fmt(data.totals.allocated)} sub="across all markets" />
          </Cards>
        )}
      </Section>

      {chartData.length > 0 && (
        <Section title="Capital Deployed by Country" subtitle="Allocated capital per market (XLM).">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Bar dataKey="allocated" fill="#0ea5e9" name="Capital Deployed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}

      <Section title="Country Breakdown" subtitle={`${rows.length} market${rows.length === 1 ? '' : 's'}`}>
        {rows.length === 0 ? (
          <Empty>No projects assigned to a country yet. Set a country on a project to populate this view.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Currency</th>
                  <th className="!text-right">Projects</th>
                  <th className="!text-right">Active</th>
                  <th className="!text-right">Capital</th>
                  <th className="!text-right">Hectares</th>
                  <th className="!text-right">Revenue</th>
                  <th className="!text-right">Buyers</th>
                  <th>Regions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.country}>
                    <td className="font-medium text-slate-900">{r.name}</td>
                    <td className="text-xs uppercase tracking-wider text-slate-500">{r.currency || '—'}</td>
                    <td className="text-right tabular-nums">{r.projects}</td>
                    <td className="text-right tabular-nums">{r.activeProjects}</td>
                    <td className="text-right tabular-nums">{fmt(r.allocated)}</td>
                    <td className="text-right tabular-nums">{r.hectares.toLocaleString()}</td>
                    <td className="text-right tabular-nums">{fmt(r.revenue)}</td>
                    <td className="text-right tabular-nums">{r.buyers}</td>
                    <td className="text-xs text-slate-500 max-w-xs truncate">{r.regions.join(', ') || '—'}</td>
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
