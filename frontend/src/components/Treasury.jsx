import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
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

        // Overview is required — a failure here surfaces as an error banner.
        const overviewData = await api.treasury.overview();
        setOverview(overviewData);

        // Flows + obligations are best-effort enhancements — don't fail the
        // whole dashboard if one of them errors.
        try {
          setFlows(await api.treasury.flows(90));
        } catch (e) {
          console.warn('Failed to fetch flows:', e.message);
          setFlows([]);
        }

        try {
          setObligations(await api.treasury.obligations());
        } catch (e) {
          console.warn('Failed to fetch obligations:', e.message);
          setObligations(null);
        }
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
