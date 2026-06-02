import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { Section, Button, TableWrap, Select, Empty } from './ui.jsx';

const STELLAR_EXPERT_TESTNET = 'https://stellar.expert/explorer/testnet/tx';

export default function TreasuryTransactions({ loading }) {
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setTxLoading(true);
        const data = await api.treasury.transactions({ page, limit, status, type });
        setTransactions(data.transactions || []);
        setTotal(data.pagination?.total || 0);
        setPages(data.pagination?.pages || 1);
      } catch (err) {
        console.error('Error fetching transactions:', err);
      } finally {
        setTxLoading(false);
      }
    };

    fetchTransactions();
  }, [page, limit, status, type, loading]);

  const fmt = (val) => {
    if (val === null || val === undefined) return '—';
    if (typeof val !== 'number') return String(val);
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status) => {
    const badges = {
      'success': 'inline-block px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-800',
      'pending': 'inline-block px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800',
      'failed': 'inline-block px-2 py-1 rounded text-xs font-medium bg-rose-100 text-rose-800'
    };
    return badges[status] || badges.pending;
  };

  const getTypeColor = (type) => {
    if (type === 'Inflow') return 'text-emerald-700';
    if (type === 'Outflow') return 'text-amber-700';
    return 'text-slate-700';
  };

  if (txLoading && transactions.length === 0) {
    return (
      <Section title="Treasury Transactions" subtitle="All capital flows through the platform">
        <div className="h-64 bg-slate-100 rounded animate-pulse" />
      </Section>
    );
  }

  return (
    <Section title="Treasury Transactions" subtitle="All capital flows through the platform">
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 p-4 bg-slate-50 rounded-lg">
          <div className="flex-1 min-w-[150px]">
            <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
              <option value="">All Types</option>
              <option value="inflow">Inflows</option>
              <option value="outflow">Outflows</option>
            </Select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All Status</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </Select>
          </div>
          <Button onClick={() => { setPage(1); setStatus(''); setType(''); }}>
            Clear Filters
          </Button>
        </div>

        {/* Transactions Table */}
        {transactions.length === 0 ? (
          <Empty>No transactions found with current filters.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Tx Hash</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <span className={`font-medium ${getTypeColor(tx.type)}`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="font-semibold text-slate-900">{fmt(tx.amount)} XLM</td>
                    <td className="text-sm text-slate-600 truncate max-w-[200px]" title={tx.senderLabel}>
                      {tx.senderLabel || '—'}
                    </td>
                    <td className="text-sm text-slate-600 truncate max-w-[200px]" title={tx.receiverLabel}>
                      {tx.receiverLabel || '—'}
                    </td>
                    <td>
                      <span className={getStatusBadge(tx.status)}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="text-xs font-mono text-slate-500">
                      {tx.txHash ? (
                        <a
                          href={`${STELLAR_EXPERT_TESTNET}/${tx.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                          title={tx.txHash}
                        >
                          {tx.txHash.slice(0, 8)}...
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-sm text-slate-600">{formatDate(tx.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div className="text-sm text-slate-600">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} transactions
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={page === 1}
                onClick={() => setPage(Math.max(1, page - 1))}
              >
                ← Previous
              </Button>
              <div className="px-3 py-2 text-sm font-medium text-slate-700">
                Page {page} of {pages}
              </div>
              <Button
                variant="ghost"
                disabled={page === pages}
                onClick={() => setPage(Math.min(pages, page + 1))}
              >
                Next →
              </Button>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
