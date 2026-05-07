import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Activity({ refreshKey = 0 }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Pagination
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  
  // Filters
  const [filterActionType, setFilterActionType] = useState('');
  const [filterUserRole, setFilterUserRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    fetchActivity();
  }, [refreshKey, limit, offset, filterActionType, filterUserRole, filterStatus]);

  async function fetchActivity() {
    try {
      setLoading(true);
      setError(null);
      const params = {
        limit,
        offset,
        ...(filterActionType && { actionType: filterActionType }),
        ...(filterUserRole && { userRole: filterUserRole }),
        ...(filterStatus && { status: filterStatus })
      };
      const data = await api.activity.list(params);
      setLogs(data.data || []);
      setTotal(data.pagination?.total || 0);
    } catch (err) {
      setError(err.message || 'Failed to fetch activity logs');
      console.error('Activity fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  const pages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  function handlePrevPage() {
    if (offset > 0) {
      setOffset(Math.max(0, offset - limit));
    }
  }

  function handleNextPage() {
    if (offset + limit < total) {
      setOffset(offset + limit);
    }
  }

  function formatTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleString();
  }

  function getStatusBadgeClass(status) {
    switch (status) {
      case 'SUCCESS': return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
      case 'FAILED': return 'bg-rose-50 text-rose-700 ring-rose-200';
      case 'PENDING': return 'bg-yellow-50 text-yellow-700 ring-yellow-200';
      default: return 'bg-slate-50 text-slate-700 ring-slate-200';
    }
  }

  function getActionBadgeClass(actionType) {
    const map = {
      'CREATE_INVESTOR': 'bg-blue-50 text-blue-700 ring-blue-200',
      'CREATE_PROJECT': 'bg-green-50 text-green-700 ring-green-200',
      'INVESTMENT': 'bg-purple-50 text-purple-700 ring-purple-200',
      'ALLOCATION': 'bg-indigo-50 text-indigo-700 ring-indigo-200',
      'PAYOUT': 'bg-orange-50 text-orange-700 ring-orange-200',
      'REVENUE_ENTRY': 'bg-cyan-50 text-cyan-700 ring-cyan-200',
      'DISTRIBUTION_GENERATED': 'bg-violet-50 text-violet-700 ring-violet-200',
      'DISTRIBUTION_PAID': 'bg-lime-50 text-lime-700 ring-lime-200',
      'FUND_WALLET': 'bg-teal-50 text-teal-700 ring-teal-200',
      'UPDATE_PROJECT': 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
    };
    return map[actionType] || 'bg-slate-50 text-slate-700 ring-slate-200';
  }

  function renderTxHash(txHash) {
    if (!txHash) return null;
    const isInternal = txHash.startsWith('internal_');
    if (isInternal) {
      return <span className="font-mono text-xs text-slate-500">{txHash.slice(0, 16)}…</span>;
    }
    const url = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
         className="font-mono text-xs text-blue-600 hover:text-blue-800 underline">
        {txHash.slice(0, 16)}…
      </a>
    );
  }

  const actionTypes = [
    'CREATE_INVESTOR', 'CREATE_PROJECT', 'INVESTMENT', 'ALLOCATION', 'PAYOUT',
    'REVENUE_ENTRY', 'DISTRIBUTION_GENERATED', 'DISTRIBUTION_PAID', 'FUND_WALLET',
    'UPDATE_PROJECT', 'CREATE_FARMER', 'DELETE_FARMER', 'LOGIN', 'LOGOUT', 'CREATE_WALLET'
  ];

  const userRoles = ['admin', 'investor', 'farmer', 'system'];
  const statuses = ['SUCCESS', 'FAILED', 'PENDING'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Activity Log</h1>
        <p className="text-sm text-slate-500">Audit trail of all system actions and transactions</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Filters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <select
            value={filterActionType}
            onChange={e => { setFilterActionType(e.target.value); setOffset(0); }}
            className="input"
          >
            <option value="">All Action Types</option>
            {actionTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select
            value={filterUserRole}
            onChange={e => { setFilterUserRole(e.target.value); setOffset(0); }}
            className="input"
          >
            <option value="">All Roles</option>
            {userRoles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setOffset(0); }}
            className="input"
          >
            <option value="">All Statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={limit}
            onChange={e => { setLimit(parseInt(e.target.value)); setOffset(0); }}
            className="input"
          >
            <option value={10}>Show 10</option>
            <option value={25}>Show 25</option>
            <option value={50}>Show 50</option>
            <option value={100}>Show 100</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Description</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-sm text-slate-500">
                    Loading activity logs…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-sm text-slate-500">
                    No activity logs found
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="border-b border-slate-200 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {formatTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${getActionBadgeClass(log.actionType)}`}>
                        {log.actionType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 max-w-xs">
                      {log.description}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusBadgeClass(log.status)}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 capitalize">
                      {log.userRole}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {renderTxHash(log.txHash)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} logs
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrevPage}
              disabled={offset === 0}
              className="btn btn-secondary disabled:opacity-50"
            >
              ← Previous
            </button>
            <div className="flex items-center gap-1 text-sm text-slate-600">
              Page {currentPage} of {pages}
            </div>
            <button
              onClick={handleNextPage}
              disabled={offset + limit >= total}
              className="btn btn-secondary disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
