import React, { useState } from 'react';
import Dashboard from './components/Dashboard.jsx';
import Investors from './components/Investors.jsx';
import InvestorDashboard from './components/InvestorDashboard.jsx';
import Projects from './components/Projects.jsx';
import Transactions from './components/Transactions.jsx';
import Payouts from './components/Payouts.jsx';
import Farmers from './components/Farmers.jsx';
import Revenue from './components/Revenue.jsx';
import Distributions from './components/Distributions.jsx';
import Reports from './components/Reports.jsx';

const NAV = [
  {
    section: 'Overview',
    items: [
      { id: 'dashboard',          label: 'Dashboard',     subtitle: 'Treasury, totals, profit trend',   icon: IconHome },
      { id: 'investor-dashboard', label: 'Investor View', subtitle: 'Per-investor portfolio summary',   icon: IconUser }
    ]
  },
  {
    section: 'Operations',
    items: [
      { id: 'investors',    label: 'Investors',    subtitle: 'Onboard investors, fund wallets',     icon: IconUsers },
      { id: 'projects',     label: 'Projects',     subtitle: 'Crops, allocation, lifecycle',         icon: IconLeaf },
      { id: 'farmers',      label: 'Farmers',      subtitle: 'Recipients of project payouts',        icon: IconTractor },
      { id: 'payouts',      label: 'Payouts',      subtitle: 'Project → farmer disbursements',       icon: IconArrowDown },
      { id: 'revenue',      label: 'Revenue',      subtitle: 'Inflows from buyers and markets',      icon: IconArrowUp }
    ]
  },
  {
    section: 'Insights',
    items: [
      { id: 'transactions',  label: 'Transactions',  subtitle: 'Unified ledger of all flows',         icon: IconList },
      { id: 'distributions', label: 'Distributions', subtitle: 'Profit splits to investors',          icon: IconShare },
      { id: 'reports',       label: 'Reports',       subtitle: 'Summaries with JSON export',          icon: IconReport }
    ]
  }
];

const ALL_TABS = NAV.flatMap(g => g.items);

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const refresh = () => setRefreshKey(k => k + 1);

  const current = ALL_TABS.find(t => t.id === tab) ?? ALL_TABS[0];

  function go(id) {
    setTab(id);
    setMobileOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={
          'fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 ' +
          'transition-transform duration-200 ease-out flex flex-col ' +
          (mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0')
        }
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-800 flex items-center justify-center text-white text-lg shadow-sm">
            🌱
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900">Agri Funds</div>
            <div className="text-[11px] text-slate-500">Investor Platform</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV.map(group => (
            <div key={group.section}>
              <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {group.section}
              </div>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const Active = tab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => go(item.id)}
                      className={'nav-link w-full text-left ' + (Active ? 'nav-link-active' : '')}
                    >
                      <Icon className={'h-4 w-4 ' + (Active ? 'text-brand-700' : 'text-slate-400 group-hover:text-slate-600')} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-5 py-3 border-t border-slate-200 text-[11px] text-slate-400">
          v0.3 · Phase 3 prototype
        </div>
      </aside>

      {/* Main column */}
      <div className="md:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200">
          <div className="px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                aria-label="Open menu"
                className="md:hidden btn-ghost !p-2"
                onClick={() => setMobileOpen(true)}
              >
                <IconMenu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-slate-900 truncate">{current.label}</h1>
                <p className="text-xs text-slate-500 truncate">{current.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Stellar mock · USDC
              </span>
              <button className="btn-ghost" onClick={refresh}>
                <IconRefresh className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
          {tab === 'dashboard'          && <Dashboard refreshKey={refreshKey} />}
          {tab === 'investor-dashboard' && <InvestorDashboard refreshKey={refreshKey} />}
          {tab === 'investors'          && <Investors refreshKey={refreshKey} onChange={refresh} />}
          {tab === 'projects'           && <Projects refreshKey={refreshKey} onChange={refresh} />}
          {tab === 'transactions'       && <Transactions refreshKey={refreshKey} />}
          {tab === 'farmers'            && <Farmers refreshKey={refreshKey} onChange={refresh} />}
          {tab === 'payouts'            && <Payouts refreshKey={refreshKey} onChange={refresh} />}
          {tab === 'revenue'            && <Revenue refreshKey={refreshKey} onChange={refresh} />}
          {tab === 'distributions'      && <Distributions refreshKey={refreshKey} onChange={refresh} />}
          {tab === 'reports'            && <Reports refreshKey={refreshKey} />}
        </main>
      </div>
    </div>
  );
}

/* ------- inline icons (lightweight, no extra deps) ------- */
function IconBase({ children, className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}
function IconHome(p)     { return <IconBase {...p}><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></IconBase>; }
function IconUser(p)     { return <IconBase {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></IconBase>; }
function IconUsers(p)    { return <IconBase {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-3.5 3.5-5.5 7-5.5s6 2 7 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M22 18c-.7-2-2-3.2-4-3.7"/></IconBase>; }
function IconLeaf(p)     { return <IconBase {...p}><path d="M5 19c0-9 7-14 16-14-1 9-6 14-14 14"/><path d="M5 19c2-3 5-5 9-6"/></IconBase>; }
function IconTractor(p)  { return <IconBase {...p}><circle cx="6" cy="17" r="3"/><circle cx="18" cy="18" r="2.5"/><path d="M3 14V8h6l2 4h4V8h4v6"/></IconBase>; }
function IconArrowDown(p){ return <IconBase {...p}><path d="M12 4v14"/><path d="M6 14l6 6 6-6"/></IconBase>; }
function IconArrowUp(p)  { return <IconBase {...p}><path d="M12 20V6"/><path d="M6 12l6-6 6 6"/></IconBase>; }
function IconList(p)     { return <IconBase {...p}><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></IconBase>; }
function IconShare(p)    { return <IconBase {...p}><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8 15.8 7.2M8.2 13.2l7.6 3.6"/></IconBase>; }
function IconReport(p)   { return <IconBase {...p}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 14v3M12 10v7M16 7v10"/></IconBase>; }
function IconRefresh(p)  { return <IconBase {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 4v4h-4"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 20v-4h4"/></IconBase>; }
function IconMenu(p)     { return <IconBase {...p}><path d="M4 6h16M4 12h16M4 18h16"/></IconBase>; }
