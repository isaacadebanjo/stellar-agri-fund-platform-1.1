import { Router } from 'express';
import Buyer from '../models/Buyer.js';
import OfftakeAgreement from '../models/OfftakeAgreement.js';
import Project from '../models/Project.js';
import Yield from '../models/Yield.js';
import Invoice from '../models/Invoice.js';
import Distribution from '../models/Distribution.js';
import { getTreasuryOverview } from '../services/treasuryAnalytics.js';
import { asyncH } from './_async.js';
import { round, sum } from '../services/money.js';

const r = Router();

// Investor-readiness rollup across the platform. Intentionally NOT admin-only —
// investors should see the confidence signals too. All figures are platform
// aggregates (no per-investor private data).
r.get('/', asyncH(async (req, res) => {
  const [overview, buyers, contracts, projects, yields, invoices, distAgg] = await Promise.all([
    getTreasuryOverview(),
    Buyer.find({ archived: false }).lean(),
    OfftakeAgreement.find({ status: { $in: ['active', 'completed'] } }).lean(),
    Project.find().lean(),
    Yield.find().lean(),
    Invoice.find().lean(),
    Distribution.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }])
  ]);

  // Buyer coverage: share of projects with at least one active/contracted offtake.
  const coveredProjects = new Set(contracts.map(c => c.projectId));
  const projectCoveragePercent = projects.length > 0
    ? round((coveredProjects.size / projects.length) * 100)
    : 0;
  const verifiedBuyers = buyers.filter(b => b.verificationStatus === 'verified').length;
  const buyerVerificationRate = buyers.length > 0 ? round((verifiedBuyers / buyers.length) * 100) : 0;

  // Yield performance (actual vs expected).
  const totalExpected = sum(yields, y => y.expectedYield);
  const totalActual = sum(yields, y => y.actualYield);
  const yieldPerformancePercent = totalExpected > 0 ? round((totalActual / totalExpected) * 100) : 0;

  // Payment collection rate.
  const totalBilled = sum(invoices, i => i.amountDue);
  const totalCollected = sum(invoices, i => i.amountPaid);
  const paymentCollectionRate = totalBilled > 0 ? round((totalCollected / totalBilled) * 100) : 0;

  const totalInvested = overview.totalInvestedCapital;
  const totalDistributed = distAgg[0]?.total || 0;
  const roiPercent = totalInvested > 0 ? round((totalDistributed / totalInvested) * 100) : 0;

  // Composite governance/readiness score (0–100): average of the available
  // signals. Phase 3 will fold in approval-workflow + milestone completion.
  const signals = [
    buyerVerificationRate,
    paymentCollectionRate,
    Math.min(yieldPerformancePercent, 100),
    projectCoveragePercent
  ];
  const governanceScore = Math.round(signals.reduce((a, b) => a + b, 0) / signals.length);

  res.json({
    capitalDeployed: round(overview.totalAllocatedCapital),
    capitalRemaining: round(overview.availableLiquidity),
    totalInvested: round(totalInvested),
    contractedRevenue: sum(contracts, c => c.contractValue),
    buyerCoveragePercent: projectCoveragePercent,
    verifiedBuyers,
    totalBuyers: buyers.length,
    buyerVerificationRate,
    yieldPerformancePercent,
    paymentCollectionRate,
    roiPercent,
    totalDistributed: round(totalDistributed),
    governanceScore,
    liquidityHealth: overview.liquidityHealth
  });
}));

export default r;
