import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function ActivityWidget({ refreshKey = 0 }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRecentActivity();
  }, [refreshKey]);

  async function fetchRecentActivity() {
    try {
      setLoading(true);
      setError(null);
      const data = await api.activity.summary(8);
      setActivities(data.recent || []);
    } catch (err) {
      setError(err.message);
      console.error('Activity widget fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  function formatTime(isoString) {
    const d = new Date(isoString);
    const now = new Date();
    const seconds = Math.floor((now - d) / 1000);
    
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function getStatusDot(status) {
    switch (status) {
      case 'SUCCESS': return <span className="h-2 w-2 rounded-full bg-emerald-500" />;
      case 'FAILED': return <span className="h-2 w-2 rounded-full bg-rose-500" />;
      case 'PENDING': return <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />;
      default: return <span className="h-2 w-2 rounded-full bg-slate-300" />;
    }
  }

  function getActionColor(actionType) {
    const map = {
      'CREATE_INVESTOR': 'text-blue-600',
      'CREATE_PROJECT': 'text-green-600',
      'INVESTMENT': 'text-purple-600',
      'ALLOCATION': 'text-indigo-600',
      'PAYOUT': 'text-orange-600',
      'REVENUE_ENTRY': 'text-cyan-600',
      'DISTRIBUTION_GENERATED': 'text-violet-600',
      'DISTRIBUTION_PAID': 'text-lime-600',
      'FUND_WALLET': 'text-teal-600',
      'UPDATE_PROJECT': 'text-fuchsia-600',
    };
    return map[actionType] || 'text-slate-600';
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900 text-sm">Recent Activity</h3>
        <a href="#" className="text-xs text-blue-600 hover:text-blue-700">View all →</a>
      </div>

      {error && (
        <div className="text-xs text-rose-600 mb-3">Failed to load activity</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div className="text-xs text-slate-500 text-center py-8">
          No recent activity
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((log) => (
            <div key={log.id} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
              <div className="mt-1">{getStatusDot(log.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-medium ${getActionColor(log.actionType)}`}>
                    {log.actionType}
                  </span>
                </div>
                <p className="text-xs text-slate-600 truncate">
                  {log.description}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {formatTime(log.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
