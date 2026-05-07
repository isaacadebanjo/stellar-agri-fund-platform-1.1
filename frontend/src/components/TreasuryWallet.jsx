import React, { useEffect, useState } from 'react';
import { Section, TableWrap, Empty, Money } from './ui.jsx';

const STELLAR_EXPERT_TESTNET = 'https://stellar.expert/explorer/testnet/tx';

export default function TreasuryWallet({ loading }) {
  const [walletInfo, setWalletInfo] = useState(null);
  const [walletLoading, setWalletLoading] = useState(true);

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        setWalletLoading(true);
        const token = localStorage.getItem('agri_token');
        if (!token) {
          setWalletInfo(null);
          return;
        }
        
        const response = await fetch('/api/dashboard', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (!response.ok) {
          console.warn('Dashboard fetch failed:', response.status);
          setWalletInfo(null);
          return;
        }
        const data = await response.json();
        
        // Extract treasury wallet from dashboard response
        if (data.treasury) {
          setWalletInfo(data.treasury);
        } else {
          setWalletInfo(null);
        }
      } catch (err) {
        console.error('Error fetching treasury wallet:', err);
        setWalletInfo(null);
      } finally {
        setWalletLoading(false);
      }
    };

    fetchWallet();
  }, []);

  const fmt = (val) => {
    if (val === null || val === undefined) return '—';
    if (typeof val !== 'number') return String(val);
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  if (walletLoading) {
    return (
      <Section title="Treasury Wallet" subtitle="Central vault for all platform flows">
        <div className="space-y-4">
          <div className="h-24 bg-slate-100 rounded animate-pulse" />
          <div className="h-32 bg-slate-100 rounded animate-pulse" />
        </div>
      </Section>
    );
  }

  if (!walletInfo) {
    return (
      <Section title="Treasury Wallet" subtitle="Central vault for all platform flows">
        <Empty>Treasury wallet not available</Empty>
      </Section>
    );
  }

  const truncateKey = (key) => {
    if (!key || key.length < 12) return key;
    return `${key.slice(0, 8)}...${key.slice(-8)}`;
  };

  return (
    <Section title="Treasury Wallet" subtitle="Central vault for all platform flows">
      <div className="space-y-6">
        {/* Wallet Details Card */}
        <div className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-200">
          <div className="space-y-4">
            <div>
              <div className="text-sm text-blue-700 opacity-75">Treasury Public Key</div>
              <div className="text-lg font-mono font-bold text-blue-900 mt-2 break-all">
                {walletInfo.publicKey || '—'}
              </div>
            </div>

            <div className="flex items-baseline gap-4">
              <div>
                <div className="text-sm text-blue-700 opacity-75">Current Balance</div>
                <div className="text-3xl font-bold text-blue-900 mt-1">
                  {fmt(walletInfo.balance)} <span className="text-sm text-blue-700 opacity-75">XLM</span>
                </div>
              </div>
              <div className="px-4 py-2 bg-blue-100 rounded-lg">
                <div className="text-xs text-blue-700 font-semibold">LIVE ON TESTNET</div>
              </div>
            </div>

            <div className="pt-4 border-t border-blue-200">
              <div className="text-xs text-blue-700 opacity-75">Last Updated</div>
              <div className="text-sm text-blue-700 mt-1">{new Date().toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Wallet Info Grid */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="text-sm font-medium text-slate-700">Label</div>
            <div className="text-lg font-semibold text-slate-900 mt-2">{walletInfo.label || 'Central Treasury'}</div>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="text-sm font-medium text-slate-700">Type</div>
            <div className="text-lg font-semibold text-slate-900 mt-2 capitalize">{walletInfo.type || 'treasury'}</div>
          </div>
        </div>

        {/* Recent Transactions Info */}
        <div className="p-4 bg-slate-50 rounded-lg">
          <div className="text-sm font-medium text-slate-700 mb-3">Recent Activity</div>
          <div className="text-sm text-slate-600">
            <p>The treasury wallet receives investments from investors and distributes to farmers and projects.</p>
            <p className="mt-2">View the <a href="#transactions" className="text-blue-600 hover:underline">Transactions table</a> below for detailed history.</p>
          </div>
        </div>

        {/* Stellar Explorer Link */}
        <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
          <div className="text-sm font-medium text-amber-700 mb-2">View on Stellar Expert</div>
          <p className="text-sm text-amber-600 mb-3">
            Check this wallet's transactions on Stellar Expert Testnet:
          </p>
          <a
            href={`https://stellar.expert/explorer/testnet/account/${walletInfo.publicKey}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 0 1 .82 1.573l-7 10A1 1 0 0 1 8 17H5a3 3 0 0 1-3-3V6z" clipRule="evenodd" />
            </svg>
            Open in Stellar Expert
          </a>
        </div>
      </div>
    </Section>
  );
}
