import React from 'react';
import { StatCard, Cards } from './ui.jsx';

export default function TreasuryOverviewCards({ data, loading }) {
  if (loading) {
    return (
      <Cards cols={4}>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-100 rounded animate-pulse" />
        ))}
      </Cards>
    );
  }

  if (!data) {
    return (
      <Cards cols={4}>
        <div className="col-span-full text-center py-8 text-slate-500">No data available</div>
      </Cards>
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

  return (
    <Cards cols={4}>
      <StatCard
        label="Treasury Wallet Balance"
        value={fmt(data.treasuryBalance)}
        sub="XLM on testnet"
        accent="LIVE"
      />
      <StatCard
        label="Total Invested Capital"
        value={fmt(data.totalInvestedCapital)}
        sub="Committed by investors"
      />
      <StatCard
        label="Total Allocated"
        value={fmt(data.totalAllocatedCapital)}
        sub={`${data.capitalUtilizationPercent || 0}% of invested`}
      />
      <StatCard
        label="Available Liquidity"
        value={fmt(data.availableLiquidity)}
        sub={data.availableLiquidity >= 0 ? 'Ready to deploy' : 'Negative balance'}
        accent={data.availableLiquidity < 0 ? 'RISK' : undefined}
      />
      <StatCard
        label="Pending Payouts"
        value={fmt(data.pendingPayouts)}
        sub="Awaiting farmer disbursement"
      />
      <StatCard
        label="Pending Distributions"
        value={fmt(data.pendingDistributions)}
        sub="Awaiting investor payout"
      />
      <StatCard
        label="Total Revenue"
        value={fmt(data.totalRevenue)}
        sub="Buyer & market inflows"
      />
      <StatCard
        label="Net Platform Position"
        value={fmt(data.netPlatformPosition)}
        sub={data.netPlatformPosition >= 0 ? 'Positive' : 'Deficit'}
        accent={data.netPlatformPosition < 0 ? 'RISK' : 'EST'}
      />
    </Cards>
  );
}
