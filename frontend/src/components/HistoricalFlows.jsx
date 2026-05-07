import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart
} from 'recharts';
import { Section } from './ui.jsx';

export default function HistoricalFlows({ data, loading }) {
  if (loading) {
    return (
      <Section title="Historical Capital Flows" subtitle="Inflows, outflows, and balance trend over 90 days">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-64 bg-slate-100 rounded animate-pulse" />
          <div className="h-64 bg-slate-100 rounded animate-pulse" />
        </div>
      </Section>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Section title="Historical Capital Flows" subtitle="Inflows, outflows, and balance trend over 90 days">
        <div className="text-center py-12 text-slate-500">No transaction history available</div>
      </Section>
    );
  }

  // Format currency for tooltips
  const formatCurrency = (value) => {
    return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XLM`;
  };

  // Custom tooltip for better readability
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded shadow-lg border border-slate-200">
          <p className="text-sm font-medium text-slate-700">{payload[0].payload.date}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Section title="Historical Capital Flows" subtitle="Inflows, outflows, and balance trend over 90 days">
      <div className="space-y-6">
        {/* Inflows vs Outflows Bar Chart */}
        <div className="p-4 bg-slate-50 rounded-lg">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Daily Inflows vs Outflows</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                stroke="#94a3b8"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="#94a3b8"
                tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="inflows" fill="#10b981" name="Inflows" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outflows" fill="#f59e0b" name="Outflows" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Treasury Balance Trend Line Chart */}
        <div className="p-4 bg-slate-50 rounded-lg">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Treasury Balance Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                stroke="#94a3b8"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="#94a3b8"
                tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="balance"
                stroke="#0ea5e9"
                strokeWidth={3}
                dot={false}
                name="Treasury Balance"
                isAnimationActive={true}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Summary Statistics */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
            <div className="text-sm text-emerald-700 opacity-75">Total Inflows (90d)</div>
            <div className="text-2xl font-bold text-emerald-700 mt-1">
              {(data.reduce((sum, d) => sum + (d.inflows || 0), 0)).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })} XLM
            </div>
          </div>
          <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
            <div className="text-sm text-amber-700 opacity-75">Total Outflows (90d)</div>
            <div className="text-2xl font-bold text-amber-700 mt-1">
              {(data.reduce((sum, d) => sum + (d.outflows || 0), 0)).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })} XLM
            </div>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-sm text-blue-700 opacity-75">Net Flow (90d)</div>
            <div className="text-2xl font-bold text-blue-700 mt-1">
              {(
                data.reduce((sum, d) => sum + (d.inflows || 0), 0) -
                data.reduce((sum, d) => sum + (d.outflows || 0), 0)
              ).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })} XLM
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
