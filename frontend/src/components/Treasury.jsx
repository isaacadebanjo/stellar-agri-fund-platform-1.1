import React, { useEffect, useState } from 'react';
import { Section, Button, ErrorBanner } from './ui.jsx';
import TreasuryOverviewCards from './TreasuryOverviewCards.jsx';
import LiquidityMetrics from './LiquidityMetrics.jsx';
import HistoricalFlows from './HistoricalFlows.jsx';
import PendingObligations from './PendingObligations.jsx';
import TreasuryWallet from './TreasuryWallet.jsx';
import TreasuryTransactions from './TreasuryTransactions.jsx';

export default function Treasury() {
  const [overview, setOverview] = useState(null);
  const [flows, setFlows] = useState(null);
  const [obligations, setObligations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch all treasury data
  useEffect(() => {
    const fetchTreasuryData = async () => {
      try {
        setLoading(true);
        setError('');

        const token = localStorage.getItem('agri_token');
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch overview
        const overviewRes = await fetch('/api/treasury/overview', { headers });
        if (!overviewRes.ok) throw new Error('Failed to fetch treasury overview');
        const overviewData = await overviewRes.json();
        setOverview(overviewData);

        // Fetch flows (historical data)
        const flowsRes = await fetch('/api/treasury/flows?days=90', { headers });
        if (!flowsRes.ok) throw new Error('Failed to fetch treasury flows');
        const flowsData = await flowsRes.json();
        setFlows(flowsData);

        // Fetch obligations
        const obligationsRes = await fetch('/api/treasury/obligations', { headers });
        if (!obligationsRes.ok) throw new Error('Failed to fetch pending obligations');
        const obligationsData = await obligationsRes.json();
        setObligations(obligationsData);
      } catch (e) {
        setError(e.message || 'Failed to load treasury data');
        console.error('Treasury error:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchTreasuryData();
  }, [refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
  };

  return (
    <>
      {/* Header with Refresh */}
      <Section
        title="Treasury Dashboard"
        subtitle="Monitor capital flows, liquidity, and obligations"
        action={
          <Button onClick={handleRefresh} disabled={loading}>
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </Button>
        }
      >
        <div className="text-sm text-slate-600">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </Section>

      {/* Error Banner */}
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Overview Cards - 8 key metrics */}
      <TreasuryOverviewCards data={overview} loading={loading} />

      {/* Liquidity Metrics - Health and calculations */}
      {overview && <LiquidityMetrics data={overview} loading={loading} />}

      {/* Historical Flows - Charts */}
      {flows && <HistoricalFlows data={flows} loading={loading} />}

      {/* Pending Obligations - Failed txs, unpaid distributions, pending payouts */}
      {obligations && <PendingObligations data={obligations} loading={loading} />}

      {/* Treasury Wallet - Stellar testnet wallet details */}
      <TreasuryWallet loading={loading} />

      {/* Treasury Transactions - Full transaction history with filters */}
      <TreasuryTransactions loading={loading} key={refreshKey} />
    </>
  );
}
