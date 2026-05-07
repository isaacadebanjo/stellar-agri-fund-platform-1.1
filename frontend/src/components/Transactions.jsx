import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Section, Badge, TableWrap, Empty, ErrorBanner, Money } from './ui.jsx';

const FILTERS = ['all', 'investment', 'allocation', 'payout'];

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
      subtitle={`${filtered.length} of ${txs.length} entries`}
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
                <th>From</th>
                <th>To</th>
                <th className="!text-right">Amount</th>
                <th>Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id}>
                  <td className="text-slate-500 whitespace-nowrap">{new Date(t.timestamp).toLocaleString()}</td>
                  <td><Badge kind={t.stage}>{t.stage}</Badge></td>
                  <td>{t.senderLabel}</td>
                  <td>{t.receiverLabel}</td>
                  <td className="text-right"><Money value={t.amount} /></td>
                  <td className="mono">{t.txHash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Section>
  );
}
