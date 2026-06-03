// Risk analytics. Pure, read-only builders that derive an institutional risk
// profile from the data the platform already records — no new collections, no
// money movement. Mirrors the composition style of treasuryAnalytics.js /
// reporting.js so the numbers reconcile with the rest of the app.
import Revenue from '../models/Revenue.js';
import Transaction from '../models/Transaction.js';
import Invoice from '../models/Invoice.js';
import OfftakeAgreement from '../models/OfftakeAgreement.js';
import Project from '../models/Project.js';
import Yield from '../models/Yield.js';
import Buyer from '../models/Buyer.js';
import { getTreasuryOverview } from './treasuryAnalytics.js';
import { round, sum } from './money.js';

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));

// Risk band from a 0–100 score (higher = riskier).
export function riskLevel(score) {
  if (score < 34) return 'low';
  if (score < 67) return 'medium';
  return 'high';
}

// Herfindahl–Hirschman concentration over a {label -> value} map.
// Returns the index (0–1), the largest single share (%), and the ranked
// exposure breakdown. A score near 100 means one counterparty dominates.
function concentration(entries) {
  const total = sum(entries, e => e.value);
  if (total <= 0) {
    return { score: 0, hhi: 0, topShare: 0, total: 0, count: 0, breakdown: [] };
  }
  const breakdown = entries
    .map(e => ({ ...e, sharePercent: round((e.value / total) * 100) }))
    .sort((a, b) => b.value - a.value);
  const hhi = breakdown.reduce((acc, e) => acc + (e.value / total) ** 2, 0);
  const topShare = breakdown[0]?.sharePercent || 0;
  // Blend HHI (whole-portfolio concentration) with the single-largest share so
  // both "few counterparties" and "one dominant counterparty" raise the score.
  const score = clamp100(hhi * 100 * 0.6 + topShare * 0.4);
  return { score, hhi: round(hhi, 4), topShare, total: round(total), count: breakdown.length, breakdown };
}

// Group helper: aggregate `field` of `rows` by `keyFn`, mapping ids to labels.
function groupValues(rows, keyFn, valueFn, labels) {
  const byKey = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    byKey.set(key, (byKey.get(key) || 0) + (valueFn(row) || 0));
  }
  return [...byKey.entries()].map(([id, value]) => ({
    id,
    label: labels.get(id) || id,
    value: round(value)
  }));
}

export async function getRiskOverview() {
  const [overview, revenues, allocations, invoices, offtakes, projects, yields, buyers, failedTxs] =
    await Promise.all([
      getTreasuryOverview(),
      Revenue.find().lean(),
      Transaction.find({ stage: 'allocation', status: 'success' }).lean(),
      Invoice.find().lean(),
      OfftakeAgreement.find({ status: { $in: ['active', 'completed'] } }).lean(),
      Project.find().lean(),
      Yield.find().lean(),
      Buyer.find({ archived: false }).lean(),
      Transaction.countDocuments({ status: 'failed' })
    ]);

  const projectNames = new Map(projects.map(p => [p._id, p.name]));
  const buyerNames = new Map(buyers.map(b => [b._id, b.name]));

  // --- Concentration risks ---
  const revenueConcentration = concentration(
    groupValues(revenues, r => r.projectId, r => r.amount, projectNames)
  );
  const buyerConcentration = concentration(
    groupValues(offtakes, o => o.buyerId, o => o.contractValue, buyerNames)
  );
  const projectConcentration = concentration(
    groupValues(allocations, t => t.projectId, t => t.amount, projectNames)
  );

  // --- Liquidity risk --- from the treasury health badge + utilization.
  const healthBase = overview.liquidityHealth === 'Critical' ? 85
    : overview.liquidityHealth === 'Tight' ? 55 : 15;
  const utilizationPenalty = overview.capitalUtilizationPercent > 90 ? 10 : 0;
  const liquidityScore = clamp100(healthBase + utilizationPenalty);
  const liquidityRisk = {
    score: liquidityScore,
    level: riskLevel(liquidityScore),
    availableLiquidity: overview.availableLiquidity,
    treasuryHealth: overview.liquidityHealth,
    capitalUtilizationPercent: overview.capitalUtilizationPercent
  };

  // --- Payment delay risk --- overdue vs outstanding receivables.
  const now = new Date();
  const outstanding = round(sum(invoices, i => Math.max(0, (i.amountDue || 0) - (i.amountPaid || 0))));
  const overdueInvoices = invoices.filter(i =>
    i.status !== 'paid' && i.dueDate && new Date(i.dueDate) < now);
  const overdueAmount = round(sum(overdueInvoices, i => Math.max(0, (i.amountDue || 0) - (i.amountPaid || 0))));
  const avgDaysOverdue = overdueInvoices.length
    ? Math.round(sum(overdueInvoices, i => (now - new Date(i.dueDate)) / 86400000) / overdueInvoices.length)
    : 0;
  const paymentScore = clamp100(outstanding > 0 ? (overdueAmount / outstanding) * 100 : 0);
  const paymentDelayRisk = {
    score: paymentScore,
    level: riskLevel(paymentScore),
    outstanding,
    overdueAmount,
    overdueCount: overdueInvoices.length,
    avgDaysOverdue
  };

  // --- Operational risk --- yield shortfall + failed on-chain transactions.
  const expectedYield = sum(yields, y => y.expectedYield);
  const actualYield = sum(yields, y => y.actualYield);
  const yieldShortfallPercent = expectedYield > 0
    ? clamp100(((expectedYield - actualYield) / expectedYield) * 100) : 0;
  const operationalScore = clamp100(yieldShortfallPercent * 0.7 + Math.min(failedTxs * 10, 30));
  const operationalRisk = {
    score: operationalScore,
    level: riskLevel(operationalScore),
    yieldPerformancePercent: expectedYield > 0 ? round((actualYield / expectedYield) * 100) : 0,
    yieldShortfallPercent,
    failedTransactions: failedTxs
  };

  // --- Composite, weighted by institutional impact ---
  const weighted = [
    { key: 'revenueConcentration', label: 'Revenue Concentration', ...revenueConcentration, weight: 0.20, impact: 2 },
    { key: 'buyerConcentration', label: 'Buyer Concentration', ...buyerConcentration, weight: 0.20, impact: 3 },
    { key: 'projectConcentration', label: 'Project Concentration', ...projectConcentration, weight: 0.15, impact: 2 },
    { key: 'liquidityRisk', label: 'Liquidity', score: liquidityScore, weight: 0.20, impact: 3 },
    { key: 'paymentDelayRisk', label: 'Payment Delay', score: paymentScore, weight: 0.15, impact: 3 },
    { key: 'operationalRisk', label: 'Operational', score: operationalScore, weight: 0.10, impact: 2 }
  ];
  const overallRiskScore = clamp100(weighted.reduce((acc, c) => acc + c.score * c.weight, 0));

  // Heatmap cells: likelihood derived from score band, impact fixed per category.
  const likelihoodOf = (s) => (s < 34 ? 1 : s < 67 ? 2 : 3);
  const heatmap = weighted.map(c => ({
    key: c.key,
    label: c.label,
    score: c.score,
    level: riskLevel(c.score),
    likelihood: likelihoodOf(c.score),
    impact: c.impact
  }));

  const trends = await getRiskTrends({ months: 6, projectNames });

  return {
    overallRiskScore,
    overallRiskLevel: riskLevel(overallRiskScore),
    generatedAt: new Date().toISOString(),
    categories: {
      revenueConcentration: { ...revenueConcentration, level: riskLevel(revenueConcentration.score) },
      buyerConcentration: { ...buyerConcentration, level: riskLevel(buyerConcentration.score) },
      projectConcentration: { ...projectConcentration, level: riskLevel(projectConcentration.score) },
      liquidityRisk,
      paymentDelayRisk,
      operationalRisk
    },
    heatmap,
    trends
  };
}

// Monthly risk trend for the last `months` months: payment-delay risk and
// revenue concentration computed within each calendar month.
async function getRiskTrends({ months = 6, projectNames }) {
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    buckets.push({ start, end, label: start.toISOString().slice(0, 7) });
  }
  const earliest = buckets[0].start;

  const [revenues, invoices] = await Promise.all([
    Revenue.find({ timestamp: { $gte: earliest } }).lean(),
    Invoice.find().lean()
  ]);

  return buckets.map(b => {
    const monthRevenue = revenues.filter(r => {
      const t = new Date(r.timestamp);
      return t >= b.start && t < b.end;
    });
    const revConc = concentration(
      groupValues(monthRevenue, r => r.projectId, r => r.amount, projectNames)
    );
    // Invoices due in this month and not paid in full → payment-delay exposure.
    const dueThisMonth = invoices.filter(i => {
      if (!i.dueDate) return false;
      const d = new Date(i.dueDate);
      return d >= b.start && d < b.end;
    });
    const billed = round(sum(dueThisMonth, i => i.amountDue));
    const unpaid = round(sum(dueThisMonth, i =>
      i.status === 'paid' ? 0 : Math.max(0, (i.amountDue || 0) - (i.amountPaid || 0))));
    const paymentDelayRisk = clamp100(billed > 0 ? (unpaid / billed) * 100 : 0);
    const overallRisk = clamp100((revConc.score + paymentDelayRisk) / 2);
    return {
      month: b.label,
      revenueConcentration: revConc.score,
      paymentDelayRisk,
      overallRisk
    };
  });
}
