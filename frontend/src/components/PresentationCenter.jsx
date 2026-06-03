import React, { useEffect, useState } from 'react';
import { api, downloadBlob } from '../api.js';
import { Section, StatCard, Cards, Button, Empty, ErrorBanner, Badge, fmt } from './ui.jsx';

const readinessKind = (band) =>
  band === 'Investment Ready' ? 'paid' : band === 'Developing' ? 'pending' : 'neutral';

// A download button that shows a spinner and surfaces errors.
function DownloadCard({ title, desc, filename, fetcher, accent }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    setBusy(true); setErr('');
    try {
      const blob = await fetcher();
      downloadBlob(filename, blob);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {accent && <Badge kind="neutral">{accent}</Badge>}
      </div>
      <p className="text-xs text-slate-500 mt-1 flex-1">{desc}</p>
      <ErrorBanner>{err}</ErrorBanner>
      <Button className="mt-3 w-full justify-center" onClick={go} disabled={busy}>
        {busy ? 'Generating…' : 'Download PDF'}
      </Button>
    </div>
  );
}

export default function PresentationCenter({ refreshKey }) {
  const [snap, setSnap] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.presentation.snapshot()
      .then(s => { setSnap(s); setErr(''); })
      .catch(e => setErr(e.message));
  }, [refreshKey]);

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Section
        title="Investor Presentation Center"
        subtitle="Board-ready documents generated live from current platform metrics."
        action={snap && <Badge kind={readinessKind(snap.scores.readinessBand)}>{snap.scores.readinessBand} · {snap.scores.investmentReadinessScore}/100</Badge>}
      >
        <ErrorBanner>{err}</ErrorBanner>
        {snap && (
          <Cards cols={4}>
            <StatCard label="Capital Deployed" value={fmt(snap.treasury.totalAllocatedCapital)} sub={`${snap.kpi.activeProjects} active projects`} />
            <StatCard label="Realised ROI" value={`${snap.kpi.investorRoiPercent}%`} sub={`${fmt(snap.kpi.totalDistributed)} distributed`} />
            <StatCard label="Treasury Health" value={snap.treasury.liquidityHealth} sub={`${fmt(snap.treasury.availableLiquidity)} available`} />
            <StatCard label="Overall Risk" value={`${snap.risk.overallRiskScore}/100`} sub={snap.risk.overallRiskLevel} />
          </Cards>
        )}
      </Section>

      <Section title="Core Documents" subtitle="The headline artifacts for an investor meeting.">
        <Cards cols={3}>
          <DownloadCard
            title="Investor Deck (15 slides)" accent="Deck"
            desc="Full landscape presentation: problem, solution, capital flow, governance, treasury, risk, reporting, readiness, roadmap."
            filename={`Agri-Funds-Investor-Deck-${stamp}.pdf`}
            fetcher={() => api.presentation.deckBlob()}
          />
          <DownloadCard
            title="Executive One-Pager" accent="Summary"
            desc="A single-page executive summary: purpose, capabilities, capital flow, controls, transparency and roadmap."
            filename={`Agri-Funds-Executive-Summary-${stamp}.pdf`}
            fetcher={() => api.presentation.onePagerBlob()}
          />
          <DownloadCard
            title="Architecture Diagrams" accent="Architecture"
            desc="Capital flow, system stack, and governance flow diagrams as a clean PDF."
            filename={`Agri-Funds-Architecture-${stamp}.pdf`}
            fetcher={() => api.presentation.architectureBlob()}
          />
        </Cards>
      </Section>

      <Section title="Audience Packs" subtitle="Tailored packs that pull the same live metrics.">
        <Cards cols={4}>
          <DownloadCard title="Investor Briefing Pack" desc="Highlights, capital & returns, transparency, risk." filename={`Agri-Funds-Investor-Briefing-Pack-${stamp}.pdf`} fetcher={() => api.presentation.packBlob('investor')} />
          <DownloadCard title="Investment Committee Pack" desc="Committee view, treasury, risk, governance, capital." filename={`Agri-Funds-Investment-Committee-Pack-${stamp}.pdf`} fetcher={() => api.presentation.packBlob('committee')} />
          <DownloadCard title="Board Pack" desc="Highlights, treasury, governance, risk indicators." filename={`Agri-Funds-Board-Pack-${stamp}.pdf`} fetcher={() => api.presentation.packBlob('board')} />
          <DownloadCard title="Partner Pack" desc="Capabilities, capital, transparency, roadmap." filename={`Agri-Funds-Partner-Pack-${stamp}.pdf`} fetcher={() => api.presentation.packBlob('partner')} />
        </Cards>
      </Section>
    </>
  );
}
