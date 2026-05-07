import React from 'react';
import { Section } from './ui.jsx';

export default function LiquidityMetrics({ data, loading }) {
  if (loading) {
    return (
      <Section title="Liquidity Analysis" subtitle="Treasury health and availability">
        <div className="h-32 bg-slate-100 rounded animate-pulse" />
      </Section>
    );
  }

  if (!data) {
    return (
      <Section title="Liquidity Analysis" subtitle="Treasury health and availability">
        <div className="text-slate-500">No data available</div>
      </Section>
    );
  }

  const fmt = (val) => {
    if (val === null || val === undefined) return '—';
    if (typeof val !== 'number') return String(val);
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  // Health badge colors
  const healthColors = {
    'Healthy': 'bg-emerald-50 border-emerald-200 text-emerald-700',
    'Tight': 'bg-amber-50 border-amber-200 text-amber-700',
    'Critical': 'bg-rose-50 border-rose-200 text-rose-700'
  };

  const healthBadgeColor = healthColors[data.liquidityHealth] || healthColors['Healthy'];

  // Utilization percentage calculation
  const utilizationPercent = data.capitalUtilizationPercent || 0;
  const utilizationColor = utilizationPercent > 90 ? 'bg-rose-500' : utilizationPercent > 70 ? 'bg-amber-500' : 'bg-emerald-500';

  // Calculate liquidity as percentage of invested capital
  const liquidityPercent = data.totalInvestedCapital > 0
    ? Math.round((data.availableLiquidity / data.totalInvestedCapital) * 100)
    : 0;

  return (
    <Section title="Liquidity Analysis" subtitle="Treasury health and availability">
      <div className="space-y-6">
        {/* Health Badge */}
        <div className={`p-4 rounded-lg border-2 ${healthBadgeColor}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium opacity-75">Treasury Health Status</div>
              <div className="text-2xl font-bold mt-1">{data.liquidityHealth}</div>
            </div>
            <div className="text-right">
              <div className="text-sm opacity-75">Available Liquidity</div>
              <div className="text-xl font-semibold">{fmt(data.availableLiquidity)} XLM</div>
            </div>
          </div>
        </div>

        {/* Liquidity Calculation Breakdown */}
        <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
          <div className="text-sm font-medium text-slate-700 mb-4">Liquidity Calculation</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Treasury Balance</span>
              <span className="font-medium">{fmt(data.treasuryBalance)} XLM</span>
            </div>
            <div className="flex justify-between text-rose-600">
              <span>− Pending Payouts</span>
              <span>({fmt(data.pendingPayouts)})</span>
            </div>
            <div className="flex justify-between text-rose-600">
              <span>− Pending Distributions</span>
              <span>({fmt(data.pendingDistributions)})</span>
            </div>
            <div className="flex justify-between text-rose-600">
              <span>− Reserve Buffer (10%)</span>
              <span>({fmt(data.totalInvestedCapital * 0.1)})</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-semibold">
              <span>= Available Liquidity</span>
              <span className={data.availableLiquidity >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                {fmt(data.availableLiquidity)} XLM
              </span>
            </div>
          </div>
        </div>

        {/* Capital Utilization Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-slate-700">Capital Utilization</span>
            <span className="font-semibold">{utilizationPercent}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full transition-all ${utilizationColor}`}
              style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
            />
          </div>
          <div className="text-xs text-slate-500">
            {fmt(data.totalAllocatedCapital)} allocated of {fmt(data.totalInvestedCapital)} invested
          </div>
        </div>

        {/* Liquidity As % of Invested */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-slate-700">Liquidity Reserve Ratio</span>
            <span className="font-semibold">{liquidityPercent}% of invested</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full transition-all ${
                liquidityPercent >= 20 ? 'bg-emerald-500' : liquidityPercent >= 10 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(liquidityPercent, 100)}%` }}
            />
          </div>
          <div className="text-xs text-slate-500">
            Ideal: 20%+ reserve, Critical: &lt;10%
          </div>
        </div>
      </div>
    </Section>
  );
}
