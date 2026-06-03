import { Router } from 'express';
import Buyer from '../models/Buyer.js';
import OfftakeAgreement from '../models/OfftakeAgreement.js';
import Project from '../models/Project.js';
import Yield from '../models/Yield.js';
import Invoice from '../models/Invoice.js';
import Distribution from '../models/Distribution.js';
import ApprovalRequest from '../models/ApprovalRequest.js';
import Milestone from '../models/Milestone.js';
import DocumentModel, { DOCUMENT_CATEGORIES } from '../models/Document.js';
import { getTreasuryOverview, getTreasuryFlows } from '../services/treasuryAnalytics.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { round, sum } from '../services/money.js';

const r = Router();
r.use(requireRole('admin'));

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));

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

  res.json({
    pendingApprovals,
    capitalUtilizationPercent: overview.capitalUtilizationPercent,
    treasuryHealth: overview.liquidityHealth,
    treasuryBalance: overview.treasuryBalance,
    availableLiquidity: overview.availableLiquidity,
    investorConfidenceScore,
    governanceScore,
    reportingComplianceScore,
    activeContracts: contracts.length,
    buyerVerification: { verified: verifiedBuyers, total: buyers.length, rate: buyerVerificationRate },
    outstandingPayments,
    roiPercent,
    totalDistributed,
    riskAlerts,
    trends: flows
  });
}));

export default r;
