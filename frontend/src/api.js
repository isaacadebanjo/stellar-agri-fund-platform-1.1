// In production, set VITE_API_BASE_URL on Vercel to your Render URL,
// e.g. https://agri-funds-api.onrender.com
// Locally it stays empty so Vite's dev proxy (vite.config.js) handles /api.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const TOKEN_KEY = 'agri_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY)
};

// Hook the AuthProvider can register so the api client can force a logout
// on 401 (expired or invalid token) without importing React in this file.
let onUnauthorized = null;
export function setOnUnauthorized(fn) { onUnauthorized = fn; }

// Unique key for an idempotent money mutation — lets the server dedupe a
// retried/double-submitted request instead of moving funds twice.
function newIdempotencyKey() {
  return (crypto.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

async function request(method, url, body, { idempotencyKey } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const res = await fetch(API_BASE + url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 401) {
    tokenStore.clear();
    if (onUnauthorized) onUnauthorized();
    throw new Error('Session expired — please sign in again');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// Like `request`, but sends multipart/form-data (file uploads). The browser
// sets the Content-Type (with boundary) automatically, so we must NOT set it.
async function requestForm(method, url, formData) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(API_BASE + url, { method, headers, body: formData });

  if (res.status === 401) {
    tokenStore.clear();
    if (onUnauthorized) onUnauthorized();
    throw new Error('Session expired — please sign in again');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// Like `request`, but for binary downloads (e.g. PDF statements): same
// API_BASE, auth header and 401 handling, but resolves to a Blob.
async function requestBlob(url) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(API_BASE + url, { headers });

  if (res.status === 401) {
    tokenStore.clear();
    if (onUnauthorized) onUnauthorized();
    throw new Error('Session expired — please sign in again');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.blob();
}

// Build a query string from a params object, skipping empty values.
function qs(params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null);
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries).toString();
}

export const api = {
  auth: {
    login: (email, password) => request('POST', '/api/auth/login', { email, password }),
    me: () => request('GET', '/api/auth/me'),
    refresh: () => request('POST', '/api/auth/refresh'),
    logout: () => request('POST', '/api/auth/logout'),
    // SEP-10 non-custodial wallet login (testnet).
    walletChallenge: (account) =>
      request('GET', `/api/auth/wallet/challenge?account=${encodeURIComponent(account)}`),
    walletVerify: (transaction) => request('POST', '/api/auth/wallet/verify', { transaction }),
    // Wallet-first account creation: signed SEP-10 challenge + profile fields.
    walletRegister: ({ transaction, name, email }) =>
      request('POST', '/api/auth/wallet/register', { transaction, name, email }),
    // Friendbot-fund the authenticated wallet user's own account (testnet).
    walletFund: () => request('POST', '/api/auth/wallet/fund')
  },
  dashboard: () => request('GET', '/api/dashboard'),
  investors: {
    list: () => request('GET', '/api/investors'),
    create: (data) => request('POST', '/api/investors', data),
    fund: (id, amount) =>
      request('POST', `/api/investors/${id}/fund`, { amount }, { idempotencyKey: newIdempotencyKey() }),
    summary: (id) => request('GET', `/api/investors/${id}/summary`)
  },
  projects: {
    list: () => request('GET', '/api/projects'),
    create: (data) => request('POST', '/api/projects', data),
    update: (id, data) => request('PATCH', `/api/projects/${id}`, data)
  },
  transactions: {
    // No params → full array (back-compat). With page/limit → { data, pagination }.
    list: (params) => request('GET', '/api/transactions' + qs(params)),
    invest: (investorId, amount) =>
      request('POST', '/api/transactions/invest', { investorId, amount }, { idempotencyKey: newIdempotencyKey() }),
    allocate: (projectId, amount) =>
      request('POST', '/api/transactions/allocate', { projectId, amount }, { idempotencyKey: newIdempotencyKey() })
  },
  payouts: {
    list: () => request('GET', '/api/payouts'),
    create: (data) => request('POST', '/api/payouts', data, { idempotencyKey: newIdempotencyKey() })
  },
  farmers: {
    list: () => request('GET', '/api/farmers'),
    create: (data) => request('POST', '/api/farmers', data)
  },
  // --- Institutional Readiness: Commercial (Phase 1) ---
  buyers: {
    list: (params) => request('GET', '/api/buyers' + qs(params)),
    summary: () => request('GET', '/api/buyers/summary'),
    create: (data) => request('POST', '/api/buyers', data),
    update: (id, data) => request('PATCH', `/api/buyers/${id}`, data),
    archive: (id) => request('POST', `/api/buyers/${id}/archive`)
  },
  offtake: {
    list: (params) => request('GET', '/api/offtake' + qs(params)),
    summary: () => request('GET', '/api/offtake/summary'),
    create: (data) => request('POST', '/api/offtake', data),
    update: (id, data) => request('PATCH', `/api/offtake/${id}`, data)
  },
  deliveries: {
    list: (params) => request('GET', '/api/deliveries' + qs(params)),
    summary: () => request('GET', '/api/deliveries/summary'),
    create: (data) => request('POST', '/api/deliveries', data),
    update: (id, data) => request('PATCH', `/api/deliveries/${id}`, data)
  },
  invoices: {
    list: (params) => request('GET', '/api/invoices' + qs(params)),
    summary: () => request('GET', '/api/invoices/summary'),
    create: (data) => request('POST', '/api/invoices', data),
    update: (id, data) => request('PATCH', `/api/invoices/${id}`, data)
  },
  // --- Institutional Readiness: Analytics (Phase 2) ---
  yields: {
    list: (params) => request('GET', '/api/yields' + qs(params)),
    summary: () => request('GET', '/api/yields/summary'),
    create: (data) => request('POST', '/api/yields', data),
    update: (id, data) => request('PATCH', `/api/yields/${id}`, data)
  },
  kpi: () => request('GET', '/api/kpi/overview'),
  investorConfidence: () => request('GET', '/api/investor-confidence'),
  // --- Institutional Readiness: Governance (Phase 3) ---
  governance: {
    pending: () => request('GET', '/api/governance/pending'),
    list: (params) => request('GET', '/api/governance' + qs(params)),
    dashboard: () => request('GET', '/api/governance/dashboard'),
    history: (params) => request('GET', '/api/governance/history' + qs(params)),
    approve: (id, comments) => request('POST', `/api/governance/${id}/approve`, { comments }),
    reject: (id, comments) => request('POST', `/api/governance/${id}/reject`, { comments })
  },
  milestones: {
    list: (projectId) => request('GET', '/api/milestones' + qs({ projectId })),
    releaseBudget: (projectId) => request('GET', `/api/milestones/release-budget/${projectId}`),
    create: (data) => request('POST', '/api/milestones', data),
    update: (id, data) => request('PATCH', `/api/milestones/${id}`, data),
    approve: (id) => request('POST', `/api/milestones/${id}/approve`),
    reject: (id) => request('POST', `/api/milestones/${id}/reject`),
    attach: (id, documentId, kind) => request('POST', `/api/milestones/${id}/attach`, { documentId, kind }),
    detach: (id, documentId) => request('POST', `/api/milestones/${id}/detach`, { documentId })
  },
  // --- Institutional-grade upgrade: Document Management (Phase 1) ---
  documents: {
    categories: () => request('GET', '/api/documents/categories'),
    list: (params) => request('GET', '/api/documents' + qs(params)),
    get: (id) => request('GET', `/api/documents/${id}`),
    versions: (id) => request('GET', `/api/documents/${id}/versions`),
    upload: (formData) => requestForm('POST', '/api/documents', formData),
    uploadVersion: (id, formData) => requestForm('POST', `/api/documents/${id}/version`, formData),
    archive: (id) => request('POST', `/api/documents/${id}/archive`),
    downloadBlob: (id) => requestBlob(`/api/documents/${id}/download`),
    previewBlob: (id) => requestBlob(`/api/documents/${id}/preview`)
  },
  // --- Institutional-grade upgrade: Investor Data Room (Phase 2) ---
  dataRoom: {
    overview: (params) => request('GET', '/api/data-room/overview' + qs(params)),
    documents: (params) => request('GET', '/api/data-room/documents' + qs(params)),
    downloadBlob: (id, params) => requestBlob(`/api/data-room/documents/${id}/download` + qs(params)),
    statementPdf: (params) => requestBlob('/api/data-room/statement/pdf' + qs(params))
  },
  // --- Institutional-grade upgrade: Board & Investor Reporting (Phase 4) ---
  boardReports: {
    json: (kind, params) => request('GET', `/api/board-reports/${kind}` + qs(params)),
    downloadBlob: (kind, params) => requestBlob(`/api/board-reports/${kind}` + qs(params))
  },
  // --- Institutional-grade upgrade: Executive Dashboard (Phase 6) ---
  executive: {
    overview: (params) => request('GET', '/api/executive/overview' + qs(params))
  },
  // --- Institutional platform: Risk Management ---
  risk: {
    overview: () => request('GET', '/api/risk/overview')
  },
  // --- Institutional platform: Treasury Forecasting ---
  forecast: {
    overview: () => request('GET', '/api/forecast/overview')
  },
  // --- Institutional platform: Investor ROI Simulator ---
  simulator: {
    baseline: () => request('GET', '/api/simulator/baseline'),
    roi: (data) => request('POST', '/api/simulator/roi', data)
  },
  // --- Institutional platform: Farm Visit Reports ---
  farmVisits: {
    list: (params) => request('GET', '/api/farm-visits' + qs(params)),
    summary: () => request('GET', '/api/farm-visits/summary'),
    create: (data) => request('POST', '/api/farm-visits', data),
    update: (id, data) => request('PATCH', `/api/farm-visits/${id}`, data)
  },
  // --- Institutional platform: Notification Center ---
  notifications: {
    list: (params) => request('GET', '/api/notifications' + qs(params)),
    unreadCount: () => request('GET', '/api/notifications/unread-count'),
    markRead: (id) => request('POST', `/api/notifications/${id}/read`),
    markAllRead: () => request('POST', '/api/notifications/read-all')
  },
  // --- Institutional platform: Multi-Country Support ---
  geography: {
    countries: () => request('GET', '/api/geography/countries'),
    overview: () => request('GET', '/api/geography/overview')
  },
  // --- Presentation Center (deck, one-pager, architecture, packs) ---
  presentation: {
    snapshot: () => request('GET', '/api/presentation/snapshot'),
    deckBlob: () => requestBlob('/api/presentation/deck.pdf'),
    onePagerBlob: () => requestBlob('/api/presentation/one-pager.pdf'),
    architectureBlob: () => requestBlob('/api/presentation/architecture.pdf'),
    packBlob: (kind) => requestBlob(`/api/presentation/pack/${kind}.pdf`)
  },
  // --- Investment Committee Assistant (hybrid) ---
  assistant: {
    status: () => request('GET', '/api/assistant/status'),
    query: (prompt, enhance = true) => request('POST', '/api/assistant/query', { prompt, enhance })
  },
  // --- Demo environment generator (gated by ALLOW_DEMO_SEED) ---
  demo: {
    status: () => request('GET', '/api/demo/status'),
    seed: () => request('POST', '/api/demo/seed', { confirm: true }),
    reset: () => request('POST', '/api/demo/reset', { confirm: true })
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
    generate: (projectId, { platformFeePercent = 10, periodStart, periodEnd } = {}) =>
      request('POST', '/api/distributions/generate',
        { projectId, platformFeePercent, periodStart, periodEnd },
        { idempotencyKey: newIdempotencyKey() }),
    markPaid: (id) =>
      request('POST', `/api/distributions/${id}/mark-paid`, undefined, { idempotencyKey: newIdempotencyKey() })
  },
  reports: {
    investors: () => request('GET', '/api/reports/investors'),
    projects: () => request('GET', '/api/reports/projects'),
    revenueVsPayout: () => request('GET', '/api/reports/revenue-vs-payout')
  },
  activity: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request('GET', '/api/activity' + (qs ? `?${qs}` : ''));
    },
    get: (id) => request('GET', `/api/activity/${id}`),
    summary: (limit = 20) => request('GET', `/api/activity/summary/recent?limit=${limit}`)
  },
  events: {
    // Short-lived ticket the SSE EventSource uses instead of the session token.
    ticket: () => request('GET', '/api/events/ticket')
  },
  statements: {
    // Investor PDF statement (binary download). Backend route is
    // /api/statements/:id/statement/pdf.
    downloadPdf: (investorId) => requestBlob(`/api/statements/${investorId}/statement/pdf`)
  },
  treasury: {
    overview: () => request('GET', '/api/treasury/overview'),
    flows: (days = 90) => request('GET', `/api/treasury/flows?days=${days}`),
    obligations: () => request('GET', '/api/treasury/obligations'),
    transactions: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request('GET', '/api/treasury/transactions' + (qs ? `?${qs}` : ''));
    }
  }
};

// Save a Blob (from requestBlob) to disk as `filename`.
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Open a Blob (from requestBlob) in a new browser tab (inline preview).
export function openBlob(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  // Revoke a bit later so the new tab has time to load it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

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
