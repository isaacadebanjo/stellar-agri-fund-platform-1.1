import React from 'react';
import { Section, Badge, TableWrap, Empty } from './ui.jsx';

export default function PendingObligations({ data, loading }) {
  if (loading) {
    return (
      <Section title="Pending Obligations" subtitle="Failed transactions, unpaid distributions, and pending payouts">
        <div className="h-48 bg-slate-100 rounded animate-pulse" />
      </Section>
    );
  }

  if (!data || data.total === 0) {
    return (
      <Section title="Pending Obligations" subtitle="Failed transactions, unpaid distributions, and pending payouts">
        <Empty>No pending obligations — treasury is clean.</Empty>
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

  const formatDate = (timestamp) => {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Combine all obligations into single array
  const allObligations = [
    ...(data.obligations.failedTransactions || []),
    ...(data.obligations.unpaidDistributions || []),
    ...(data.obligations.pendingPayouts || [])
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Get badge color and label based on obligation type
  const getTypeInfo = (type) => {
    switch (type) {
      case 'FAILED_TRANSACTION':
        return { label: 'Failed Tx', className: 'badge-danger' };
      case 'UNPAID_DISTRIBUTION':
        return { label: 'Unpaid Dist', className: 'badge-warning' };
      case 'PENDING_PAYOUT':
        return { label: 'Pending Payout', className: 'badge-info' };
      default:
        return { label: type, className: 'badge-default' };
    }
  };

  return (
    <Section title="Pending Obligations" subtitle="Failed transactions, unpaid distributions, and pending payouts">
      <div className="space-y-4">
        {/* Summary Cards */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 bg-rose-50 rounded-lg border border-rose-200">
            <div className="text-sm text-rose-700 opacity-75">Failed Transactions</div>
            <div className="text-2xl font-bold text-rose-700 mt-1">
              {data.obligations.failedTransactions?.length || 0}
            </div>
          </div>
          <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
            <div className="text-sm text-amber-700 opacity-75">Unpaid Distributions</div>
            <div className="text-2xl font-bold text-amber-700 mt-1">
              {data.obligations.unpaidDistributions?.length || 0}
            </div>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-sm text-blue-700 opacity-75">Pending Payouts</div>
            <div className="text-2xl font-bold text-blue-700 mt-1">
              {data.obligations.pendingPayouts?.length || 0}
            </div>
          </div>
        </div>

        {/* Obligations Table */}
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Description</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {allObligations.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-6 text-slate-500">
                    No pending obligations
                  </td>
                </tr>
              ) : (
                allObligations.map((item, idx) => {
                  const typeInfo = getTypeInfo(item.type);
                  return (
                    <tr key={idx}>
                      <td>
                        <Badge
                          variant={
                            item.type === 'FAILED_TRANSACTION'
                              ? 'danger'
                              : item.type === 'UNPAID_DISTRIBUTION'
                              ? 'warning'
                              : 'info'
                          }
                        >
                          {typeInfo.label}
                        </Badge>
                      </td>
                      <td className="font-medium text-slate-900">{fmt(item.amount)} XLM</td>
                      <td className="text-sm text-slate-600">{item.description}</td>
                      <td className="text-sm text-slate-500">{formatDate(item.timestamp)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </Section>
  );
}
