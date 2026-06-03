import React, { useEffect, useState } from 'react';

// Guided investor-presentation walkthrough. Drives the app's navigation through a
// scripted sequence of screens with a talking-point per step. Three flows of
// increasing depth (3 / 5 / 10 minutes). Designed to overlay the live app so
// every screen shows real data.
const FLOWS = {
  '3': {
    label: '3-minute',
    steps: [
      { tab: 'dashboard', title: 'Treasury at a glance', script: 'Open on the dashboard — total capital, profit trend and treasury position in one view.' },
      { tab: 'executive', title: 'Investment readiness', script: 'The executive dashboard scores readiness, governance and risk, with a board-ready summary.' },
      { tab: 'presentation', title: 'One-click investor pack', script: 'Generate a live investor deck and one-pager that pull current metrics — hand it over on the spot.' }
    ]
  },
  '5': {
    label: '5-minute',
    steps: [
      { tab: 'dashboard', title: 'Treasury at a glance', script: 'Start with the headline treasury and profit position.' },
      { tab: 'executive', title: 'Investment readiness', script: 'Readiness score, composite governance/risk scores and executive summary.' },
      { tab: 'risk', title: 'Risk management', script: 'Concentration, liquidity and payment-delay risk — scored, mapped on a heatmap and trended.' },
      { tab: 'data-room', title: 'Investor data room', script: 'Every statement, report and document, scoped to the right investor.' },
      { tab: 'presentation', title: 'Investor packs', script: 'Download the investor, committee, board or partner pack — all live.' }
    ]
  },
  '10': {
    label: '10-minute',
    steps: [
      { tab: 'dashboard', title: 'Treasury at a glance', script: 'Headline treasury, totals and profit trend.' },
      { tab: 'treasury', title: 'Capital flows & liquidity', script: 'Inflows, outflows and liquidity over time.' },
      { tab: 'executive', title: 'Investment readiness', script: 'Composite readiness, governance and risk scores with a narrative summary.' },
      { tab: 'risk', title: 'Risk management', script: 'Concentration / liquidity / payment / operational risk, heatmap and trends.' },
      { tab: 'forecast', title: 'Treasury forecasting', script: '30 / 90 / 365-day liquidity forecast from contracted inflows and obligations.' },
      { tab: 'governance', title: 'Governance & approvals', script: 'Approval gates and milestone-based capital release with a full audit trail.' },
      { tab: 'geography', title: 'Multi-country portfolio', script: 'Capital, projects and buyers across operating markets.' },
      { tab: 'assistant', title: 'IC assistant', script: 'Ask the assistant to summarize performance, risks and returns from live data.' },
      { tab: 'data-room', title: 'Investor data room', script: 'Due-diligence documents and statements, scoped per investor.' },
      { tab: 'presentation', title: 'Investor packs', script: 'Generate the full set of board-ready PDFs live.' }
    ]
  }
};

export default function DemoMode({ onNavigate, onExit }) {
  const [flowKey, setFlowKey] = useState(null);
  const [step, setStep] = useState(0);

  const flow = flowKey ? FLOWS[flowKey] : null;
  const current = flow?.steps[step];

  // Navigate the app whenever the active step changes.
  useEffect(() => {
    if (current) onNavigate(current.tab);
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard control: arrows to move, Esc to exit.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') exit();
      if (!flow) return;
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // re-bind each render so closures see latest step

  function startFlow(key) {
    setFlowKey(key); setStep(0);
    try { document.documentElement.requestFullscreen?.(); } catch { /* ignore */ }
  }
  function next() { if (flow && step < flow.steps.length - 1) setStep(step + 1); }
  function prev() { if (step > 0) setStep(step - 1); }
  function exit() {
    try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch { /* ignore */ }
    onExit();
  }

  // Flow picker.
  if (!flow) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="card p-6 max-w-lg w-full">
          <h2 className="text-lg font-semibold text-slate-900">Presentation Mode</h2>
          <p className="text-sm text-slate-500 mt-1">A guided, full-screen walkthrough over the live platform. Pick a length:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {Object.entries(FLOWS).map(([key, f]) => (
              <button key={key} onClick={() => startFlow(key)}
                className="card p-4 text-left hover:shadow-pop transition-shadow">
                <div className="text-2xl font-semibold text-brand-700">{key}<span className="text-sm text-slate-400"> min</span></div>
                <div className="text-xs text-slate-500 mt-1">{f.steps.length} screens · {f.label} flow</div>
              </button>
            ))}
          </div>
          <div className="flex justify-end mt-5">
            <button onClick={onExit} className="btn-ghost">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // Active step control bar (fixed at the bottom, app visible above).
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-3xl card shadow-pop border-brand-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-700 bg-brand-50 rounded-full px-2 py-0.5 ring-1 ring-brand-100">
            {flow.label} · step {step + 1}/{flow.steps.length}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${((step + 1) / flow.steps.length) * 100}%` }} />
          </div>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{current.title}</div>
            <div className="text-xs text-slate-500 mt-0.5">{current.script}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={prev} disabled={step === 0} className="btn-ghost disabled:opacity-40">← Prev</button>
            {step < flow.steps.length - 1
              ? <button onClick={next} className="btn-primary">Next →</button>
              : <button onClick={exit} className="btn-primary">Finish</button>}
            <button onClick={exit} className="btn-ghost">Exit</button>
          </div>
        </div>
      </div>
    </div>
  );
}
