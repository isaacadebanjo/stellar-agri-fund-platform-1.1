// The single composed "state of the platform" snapshot. Every presentation
// artifact (investor deck, executive one-pager, board/IC/partner packs) and the
// IC assistant pull from THIS, so all of them show reconciled numbers sourced
// from the same analytics services the live dashboards use. Read-only.
import { getTreasuryOverview } from './treasuryAnalytics.js';
import { getKpiOverview } from './kpiAnalytics.js';
import { getRiskOverview } from './riskAnalytics.js';
import { getForecast } from './forecast.js';
import { buildBoardReport } from './reporting.js';
import { round } from './money.js';

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));

export async function getSnapshot() {
  const [treasury, kpi, risk, forecast, board] = await Promise.all([
    getTreasuryOverview(),
    getKpiOverview(),
    getRiskOverview(),
    getForecast(),
    buildBoardReport()
  ]);

  const gm = board.governanceMetrics || {};

  // Investment Readiness: a board-friendly composite of de-risking, governance
  // discipline and capital efficiency. (Lower risk → higher readiness.)
  const investmentReadinessScore = clamp100(
    ((100 - risk.overallRiskScore) +
      (gm.buyerVerificationRate || 0) +
      (gm.milestoneCompletionRate || 0) +
      Math.min(kpi.capitalUtilizationPercent || 0, 100)) / 4
  );
  const readinessBand = investmentReadinessScore >= 75 ? 'Investment Ready'
    : investmentReadinessScore >= 50 ? 'Developing' : 'Early Stage';

  const highlights = [
    `${round(treasury.totalAllocatedCapital).toLocaleString()} XLM capital deployed across ${kpi.activeProjects} active project(s)`,
    `${kpi.investorRoiPercent}% realised investor ROI · ${kpi.grossMarginPercent}% gross margin`,
    `${gm.buyerVerificationRate || 0}% of buyers verified · ${gm.activeContracts || 0} active offtake contracts`,
    `Treasury liquidity rated ${treasury.liquidityHealth} · overall risk ${risk.overallRiskLevel}`
  ];

  return {
    generatedAt: new Date().toISOString(),
    org: { name: 'Agri Funds', tagline: 'Institutional Agricultural Investment Platform', network: 'Stellar testnet', asset: 'XLM' },
    scores: { investmentReadinessScore, readinessBand },
    treasury,
    kpi,
    risk,
    forecast,
    governance: gm,
    board,
    highlights,
    riskIndicators: board.riskIndicators || []
  };
}
