import { Router } from 'express';
import Buyer from '../models/Buyer.js';
import OfftakeAgreement from '../models/OfftakeAgreement.js';
import Project from '../models/Project.js';
import Yield from '../models/Yield.js';
import Invoice from '../models/Invoice.js';
import Distribution from '../models/Distribution.js';
import ApprovalRequest from '../models/ApprovalRequest.js';
import Milestone from '../models/Milestone.js';
import Revenue from '../models/Revenue.js';
import Transaction from '../models/Transaction.js';
import DocumentModel, { DOCUMENT_CATEGORIES } from '../models/Document.js';
import { getTreasuryOverview, getTreasuryFlows } from '../services/treasuryAnalytics.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { round, sum } from '../services/money.js';

const r = Router();
r.use(requireRole('admin'));

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));
const fmtXlm = (n) => `${round(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XLM`;

// Monthly revenue / profit / yield-performance over the last `months` months —
// powers the executive trend charts. Profit = revenue − farmer payouts in period.
async function buildMonthlyTrends(months = 6) {
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    buckets.push({ start, end, label: start.toISOString().slice(0, 7) });
  }
  const earliest = buckets[0].start;

  const [revenues, payouts, yields] = await Promise.all([
    Revenue.find({ timestamp: { $gte: earliest } }).lean(),
    Transaction.find({ stage: 'payout', status: 'success', timestamp: { $gte: earliest } }).lean(),
    Yield.find().lean()
  ]);

  return buckets.map(b => {
    const revenue = round(sum(revenues.filter(r => {
      const t = new Date(r.timestamp); return t >= b.start && t < b.end;
    }), r => r.amount));
    const payout = round(sum(payouts.filter(p => {
      const t = new Date(p.timestamp); return t >= b.start && t < b.end;
    }), p => p.amount));
    const monthYields = yields.filter(y => {
      if (!y.harvestDate) return false;
      const d = new Date(y.harvestDate); return d >= b.start && d < b.end;
    });
    const exp = sum(monthYields, y => y.expectedYield);
    const act = sum(monthYields, y => y.actualYield);
    return {
      month: b.label,
      revenue,
      profit: round(revenue - payout),
      yieldPerformance: exp > 0 ? round((act / exp) * 100) : 0
    };
  });
}

// Executive governance dashboard: a single snapshot of platform health plus a
// treasury trend series for charts. Composed from the same building blocks the
// individual modules use, so the numbers reconcile across the app.
r.get('/overview', asyncH(async (req, res) => {
  const days = Math.min(365, Math.max(7, parseInt(req.query.days, 10) || 90));

  const [overview, flows, buyers, contracts, projects, yields, invoices, approvals, milestones, distAgg, docCategories] =
    await Promise.all([
      getTreasuryOverview(),
      getTreasuryFlows(days),
      Buyer.find({ archived: false }).lean(),
      OfftakeAgreement.find({ status: { $in: ['active', 'completed'] } }).lean(),
      Project.find().lean(),
      Yield.find().lean(),
      Invoice.find().lean(),
      ApprovalRequest.find().lean(),
      Milestone.find().lean(),
      Distribution.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
      DocumentModel.distinct('category', { status: 'active' })
    ]);

  // --- Buyer verification ---
  const verifiedBuyers = buyers.filter(b => b.verificationStatus === 'verified').length;
  const buyerVerificationRate = buyers.length ? round((verifiedBuyers / buyers.length) * 100) : 0;

  // --- Yield + payments ---
  const totalExpected = sum(yields, y => y.expectedYield);
  const totalActual = sum(yields, y => y.actualYield);
  const yieldPerformancePercent = totalExpected > 0 ? round((totalActual / totalExpected) * 100) : 0;
  const totalBilled = sum(invoices, i => i.amountDue);
  const totalCollected = sum(invoices, i => i.amountPaid);
  const paymentCollectionRate = totalBilled > 0 ? round((totalCollected / totalBilled) * 100) : 0;
  const outstandingPayments = round(sum(invoices, i => Math.max(0, (i.amountDue || 0) - (i.amountPaid || 0))));

  // --- Project / buyer coverage ---
  const coveredProjects = new Set(contracts.map(c => c.projectId));
  const projectCoveragePercent = projects.length ? round((coveredProjects.size / projects.length) * 100) : 0;

  // --- Approvals ---
  const pendingApprovals = approvals.filter(a => a.status === 'pending').length;
  const decided = approvals.filter(a => a.status === 'approved' || a.status === 'rejected');
  const approvedCount = approvals.filter(a => a.status === 'approved').length;
  const approvalRate = decided.length ? round((approvedCount / decided.length) * 100) : 100;

  // --- Milestones ---
  const approvedMilestones = milestones.filter(m => m.approvalStatus === 'approved').length;
  const milestoneCompletionRate = milestones.length ? round((approvedMilestones / milestones.length) * 100) : 0;

  const totalInvested = overview.totalInvestedCapital;
  const totalDistributed = round(distAgg[0]?.total || 0);
  const roiPercent = totalInvested > 0 ? round((totalDistributed / totalInvested) * 100) : 0;

  // --- Composite scores (0–100) ---
  const investorConfidenceScore = clamp100(
    ([buyerVerificationRate, paymentCollectionRate, Math.min(yieldPerformancePercent, 100), projectCoveragePercent]
      .reduce((a, b) => a + b, 0)) / 4
  );
  const governanceScore = clamp100(
    ([approvalRate, milestoneCompletionRate, buyerVerificationRate].reduce((a, b) => a + b, 0)) / 3
  );
  // Reporting compliance: share of the 10 document categories that have at least
  // one active document on file.
  const reportingComplianceScore = clamp100((docCategories.length / DOCUMENT_CATEGORIES.length) * 100);

  // Investment Readiness Score: the headline composite an investment committee
  // looks at — confidence, governance and reporting discipline together.
  const investmentReadinessScore = clamp100(
    (investorConfidenceScore + governanceScore + reportingComplianceScore) / 3
  );
  const readinessBand = investmentReadinessScore >= 75 ? 'Investment Ready'
    : investmentReadinessScore >= 50 ? 'Developing' : 'Early Stage';

  // --- Risk alerts ---
  const riskAlerts = [];
  if (overview.liquidityHealth !== 'Healthy') {
    riskAlerts.push({ level: overview.liquidityHealth === 'Critical' ? 'high' : 'medium', label: `Treasury liquidity is ${overview.liquidityHealth}` });
  }
  const overdue = invoices.filter(i => i.status !== 'paid' && i.dueDate && new Date(i.dueDate) < new Date());
  if (overdue.length) riskAlerts.push({ level: 'medium', label: `${overdue.length} overdue invoice(s)` });
  if (pendingApprovals) riskAlerts.push({ level: 'low', label: `${pendingApprovals} approval(s) awaiting sign-off` });
  if (buyers.length && buyerVerificationRate < 50) riskAlerts.push({ level: 'medium', label: `Only ${buyerVerificationRate}% of buyers verified` });
  if (reportingComplianceScore < 50) riskAlerts.push({ level: 'low', label: `Reporting compliance at ${reportingComplianceScore}%` });

  // Contracted revenue: total value of active/completed offtake agreements.
  const contractedRevenue = round(sum(contracts, c => c.contractValue || 0));
  const activeProjects = projects.filter(p => p.status === 'active').length;
  const monthlyTrends = await buildMonthlyTrends(6);

  // Executive summary: a board-ready narrative plus the headline figures.
  const executiveSummary = {
    headline:
      `The platform is ${readinessBand.toLowerCase()} (readiness ${investmentReadinessScore}/100), ` +
      `with ${fmtXlm(overview.totalAllocatedCapital)} deployed across ${activeProjects} active project(s), ` +
      `${fmtXlm(contractedRevenue)} in contracted revenue and treasury liquidity rated ${overview.liquidityHealth}.`,
    highlights: [
      `${overview.capitalUtilizationPercent}% capital utilization`,
      `${buyerVerificationRate}% of buyers verified`,
      `${yieldPerformancePercent}% yield performance`,
      `${roiPercent}% realised ROI`
    ]
  };

  res.json({
    pendingApprovals,
    capitalUtilizationPercent: overview.capitalUtilizationPercent,
    treasuryHealth: overview.liquidityHealth,
    treasuryBalance: overview.treasuryBalance,
    availableLiquidity: overview.availableLiquidity,
    capitalDeployed: overview.totalAllocatedCapital,
    contractedRevenue,
    investorConfidenceScore,
    governanceScore,
    reportingComplianceScore,
    investmentReadinessScore,
    readinessBand,
    activeContracts: contracts.length,
    buyerVerification: { verified: verifiedBuyers, total: buyers.length, rate: buyerVerificationRate },
    outstandingPayments,
    roiPercent,
    totalDistributed,
    executiveSummary,
    riskAlerts,
    trends: flows,
    monthlyTrends
  });
}));

export default r;
