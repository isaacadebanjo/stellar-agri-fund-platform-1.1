// In production, set VITE_API_BASE_URL on Vercel to your Render URL,
// e.g. https://agri-funds-api.onrender.com
// Locally it stays empty so Vite's dev proxy (vite.config.js) handles /api.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function request(method, url, body) {
  const res = await fetch(API_BASE + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  dashboard: () => request('GET', '/api/dashboard'),
  investors: {
    list: () => request('GET', '/api/investors'),
    create: (data) => request('POST', '/api/investors', data),
    fund: (id, amount) => request('POST', `/api/investors/${id}/fund`, { amount }),
    summary: (id) => request('GET', `/api/investors/${id}/summary`)
  },
  projects: {
    list: () => request('GET', '/api/projects'),
    create: (data) => request('POST', '/api/projects', data),
    update: (id, data) => request('PATCH', `/api/projects/${id}`, data)
  },
  transactions: {
    list: () => request('GET', '/api/transactions'),
    invest: (investorId, amount) => request('POST', '/api/transactions/invest', { investorId, amount }),
    allocate: (projectId, amount) => request('POST', '/api/transactions/allocate', { projectId, amount })
  },
  payouts: {
    list: () => request('GET', '/api/payouts'),
    create: (data) => request('POST', '/api/payouts', data)
  },
  farmers: {
    list: () => request('GET', '/api/farmers'),
    create: (data) => request('POST', '/api/farmers', data)
  },
  revenue: {
    list: (projectId) => request('GET', '/api/revenue' + (projectId ? `?projectId=${projectId}` : '')),
    create: (data) => request('POST', '/api/revenue', data)
  },
  distributions: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request('GET', '/api/distributions' + (qs ? `?${qs}` : ''));
    },
    preview: (projectId, platformFeePercent = 10) =>
      request('GET', `/api/distributions/preview/${projectId}?platformFeePercent=${platformFeePercent}`),
    generate: (projectId, platformFeePercent = 10) =>
      request('POST', '/api/distributions/generate', { projectId, platformFeePercent }),
    markPaid: (id) => request('POST', `/api/distributions/${id}/mark-paid`)
  },
  reports: {
    investors: () => request('GET', '/api/reports/investors'),
    projects: () => request('GET', '/api/reports/projects'),
    revenueVsPayout: () => request('GET', '/api/reports/revenue-vs-payout')
  }
};

// Trigger a JSON file download in the browser.
export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
