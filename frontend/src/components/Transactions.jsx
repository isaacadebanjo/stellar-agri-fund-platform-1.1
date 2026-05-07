import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Section, Badge, TableWrap, Empty, ErrorBanner, Money } from './ui.jsx';

const FILTERS = ['all', 'investment', 'allocation', 'payout'];

// Stellar Expert is the standard public block explorer for Stellar.
// Real testnet txs (network='stellar-testnet') get a clickable link;
// internal book-keeping entries don't.
const explorerUrl = (hash) => `https://stellar.expert/explorer/testnet/tx/${hash}`;

export default function Transactions({ refreshKey }) {
  const [txs, setTxs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [err, setErr] = useState('');

  useEffect(() => {
    api.transactions.list().then(setTxs).catch(e => setErr(e.message));
  }, [refreshKey]);

  const filtered = filter === 'all' ? txs : txs.filter(t => t.stage === filter);

  return (
    <Section
      title="Transaction Ledger"
      subtitle={`${filtered.length} of ${txs.length} entries · real testnet payments + internal book-keeping`}
      action={
        <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                'px-3 py-1 text-xs font-medium rounded-md transition-colors ' +
                (filter === f
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900')
              }
            >
              {f}
            </button>
          ))}
        </div>
      }
    >
      <ErrorBanner>{err}</ErrorBanner>
      {filtered.length === 0 ? (
        <Empty>No transactions.</Empty>
      ) : (
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Stage</th>
                <th>Status</th>
                <th>From</th>
                <th>To</th>
                <th className="!text-right">Amount</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const onChain = t.network === 'stellar-testnet' && t.txHash;
                return (
                  <tr key={t.id}>
                    <td className="text-slate-500 whitespace-nowrap">{new Date(t.timestamp).toLocaleString()}</td>
                    <td><Badge kind={t.stage}>{t.stage}</Badge></td>
                    <td><Badge kind={t.status === 'failed' ? 'cancelled' : t.status === 'pending' ? 'pending' : 'paid'}>{t.status || 'success'}</Badge></td>
                    <td>{t.senderLabel}</td>
                    <td>{t.receiverLabel}</td>
                    <td className="text-right"><Money value={t.amount} /></td>
                    <td className="mono">
                      {onChain ? (
                        <a
                          href={explorerUrl(t.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-700 hover:text-brand-800 underline-offset-2 hover:underline"
                          title="View on Stellar Expert (testnet)"
                        >
                          {t.txHash.slice(0, 10)}…
                        </a>
                      ) : (
                        <span className="text-slate-400">{t.txHash || '—'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Section>
  );
}
