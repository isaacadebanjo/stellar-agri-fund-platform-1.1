// Board & investor reporting. Pure data builders — they assemble structured
// report objects from MongoDB; the PDF (pdfReports.js) and Excel
// (excelReports.js) renderers turn these into files, and the route also returns
// them as JSON. Keeping the data separate from rendering means one source of
// truth across PDF / Excel / API.
import Transaction from '../models/Transaction.js';
import Revenue from '../models/Revenue.js';
import Distribution from '../models/Distribution.js';
import Project from '../models/Project.js';
import Yield from '../models/Yield.js';
import Invoice from '../models/Invoice.js';
import Buyer from '../models/Buyer.js';
import OfftakeAgreement from '../models/OfftakeAgreement.js';
import ApprovalRequest from '../models/ApprovalRequest.js';
import Milestone from '../models/Milestone.js';
import { getTreasuryOverview } from './treasuryAnalytics.js';
import { round, sum } from './money.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// Sum of `field` on docs whose `timestamp` falls in [start, end).
async function sumInPeriod(Model, match, start, end, field = 'amount') {
  const agg = await Model.aggregate([
    { $match: { ...match, timestamp: { $gte: start, $lt: end } } },
    { $group: { _id: null, total: { $sum: `$${field}` } } }
  ]);
  return round(agg[0]?.total || 0);
}

// ---- Monthly report -------------------------------------------------------
export async function buildMonthlyReport({ year, month }) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const [capitalDeployed, payouts, revenueGenerated, investorReturns, overview, yields] =
    await Promise.all([
      sumInPeriod(Transaction, { stage: 'allocation', status: 'success' }, start, end),
      sumInPeriod(Transaction, { stage: 'payout', status: 'success' }, start, end),
      sumInPeriod(Revenue, {}, start, end),
      sumInPeriod(Distribution, {}, start, end),
      getTreasuryOverview(),
      Yield.find().lean()
    ]);

  // Yield metrics for crops harvested in the period (harvestDate is a string).
  const periodYields = yields.filter(y => {
    if (!y.harvestDate) return false;
    const d = new Date(y.harvestDate);
    return d >= start && d < end;
  });
  const expectedYield = sum(periodYields, y => y.expectedYield);
  const actualYield = sum(periodYields, y => y.actualYield);

  return {
    type: 'monthly',
    title: `Monthly Report — ${MONTHS[month - 1]} ${year}`,
    period: { year, month, label: `${MONTHS[month - 1]} ${year}`, start: start.toISOString(), end: end.toISOString() },
    metrics: {
      capitalDeployed,
      revenueGenerated,
      profitGenerated: round(revenueGenerated - payouts),
      investorReturns,
      treasuryBalance: overview.treasuryBalance,
      yield: {
        expected: expectedYield,
        actual: actualYield,
        performancePercent: expectedYield > 0 ? round((actualYield / expectedYield) * 100) : 0
      }
    }
  };
}

// ---- Quarterly report -----------------------------------------------------
export async function buildQuarterlyReport({ year, quarter }) {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));

  const [projects, allocAgg, payoutAgg, revAgg, distAgg, overview, yields] = await Promise.all([
    Project.find().lean(),
    Transaction.aggregate([
      { $match: { stage: 'allocation', status: 'success', timestamp: { $gte: start, $lt: end } } },
      { $group: { _id: '$projectId', total: { $sum: '$amount' } } }
    ]),
    Transaction.aggregate([
      { $match: { stage: 'payout', status: 'success', timestamp: { $gte: start, $lt: end } } },
      { $group: { _id: '$projectId', total: { $sum: '$amount' } } }
    ]),
    Revenue.aggregate([
      { $match: { timestamp: { $gte: start, $lt: end } } },
      { $group: { _id: '$projectId', total: { $sum: '$amount' } } }
    ]),
    Distribution.aggregate([
      { $match: { timestamp: { $gte: start, $lt: end } } },
      { $group: { _id: '$projectId', total: { $sum: '$amount' } } }
    ]),
    getTreasuryOverview(),
    Yield.find().lean()
  ]);

  const allocMap = new Map(allocAgg.map(a => [a._id, a.total]));
  const payoutMap = new Map(payoutAgg.map(a => [a._id, a.total]));
  const revMap = new Map(revAgg.map(a => [a._id, a.total]));
  const distMap = new Map(distAgg.map(a => [a._id, a.total]));

  const projectPerformance = projects.map(p => {
    const allocated = round(allocMap.get(p._id) || 0);
    const payout = round(payoutMap.get(p._id) || 0);
    const revenue = round(revMap.get(p._id) || 0);
    const distributed = round(distMap.get(p._id) || 0);
    const profit = round(revenue - payout);
    return {
      projectId: p._id,
      name: p.name,
      status: p.status,
      allocated,
      revenue,
      profit,
      distributed,
      roiPercent: allocated > 0 ? round((profit / allocated) * 100) : 0
    };
  });

  const totalAllocated = sum(projectPerformance, r => r.allocated);
  const totalProfit = sum(projectPerformance, r => r.profit);
  const expectedYield = sum(yields, y => y.expectedYield);
  const actualYield = sum(yields, y => y.actualYield);

  return {
    type: 'quarterly',
    title: `Quarterly Report — Q${quarter} ${year}`,
    period: { year, quarter, label: `Q${quarter} ${year}`, start: start.toISOString(), end: end.toISOString() },
    projectPerformance,
    metrics: {
      overallRoiPercent: totalAllocated > 0 ? round((totalProfit / totalAllocated) * 100) : 0,
      capitalUtilizationPercent: overview.capitalUtilizationPercent,
      activeProjects: projects.filter(p => p.status === 'active').length,
      totalProjects: projects.length,
      totalHectares: round(sum(projects, p => p.hectares || 0)),
      yieldPerformancePercent: expectedYield > 0 ? round((actualYield / expectedYield) * 100) : 0
    }
  };
}

// ---- Board report (current snapshot) --------------------------------------
export async function buildBoardReport() {
  const [overview, projects, buyers, contracts, invoices, approvals, milestones, distAgg] =
    await Promise.all([
      getTreasuryOverview(),
      Project.find().lean(),
      Buyer.find({ archived: false }).lean(),
      OfftakeAgreement.find({ status: { $in: ['active', 'completed'] } }).lean(),
      Invoice.find().lean(),
      ApprovalRequest.find().lean(),
      Milestone.find().lean(),
      Distribution.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }])
    ]);

  const verifiedBuyers = buyers.filter(b => b.verificationStatus === 'verified').length;
  const buyerVerificationRate = buyers.length ? round((verifiedBuyers / buyers.length) * 100) : 0;
  const approvedMilestones = milestones.filter(m => m.approvalStatus === 'approved').length;
  const milestoneCompletionRate = milestones.length ? round((approvedMilestones / milestones.length) * 100) : 0;

  const overdueInvoices = invoices.filter(i => {
    if (i.status === 'paid' || !i.dueDate) return false;
    return new Date(i.dueDate) < new Date();
  });
  const outstandingPayments = round(sum(invoices, i => Math.max(0, (i.amountDue || 0) - (i.amountPaid || 0))));
  const pendingApprovals = approvals.filter(a => a.status === 'pending').length;
  const totalDistributed = round(distAgg[0]?.total || 0);

  // Risk indicators — surfaced as a list the board can scan.
  const riskIndicators = [];
  if (overview.liquidityHealth !== 'Healthy') {
    riskIndicators.push({ level: overview.liquidityHealth === 'Critical' ? 'high' : 'medium', label: `Treasury liquidity is ${overview.liquidityHealth}` });
  }
  if (overdueInvoices.length) {
    riskIndicators.push({ level: 'medium', label: `${overdueInvoices.length} overdue invoice(s)` });
  }
  if (pendingApprovals) {
    riskIndicators.push({ level: 'low', label: `${pendingApprovals} approval(s) awaiting sign-off` });
  }
  if (buyers.length && buyerVerificationRate < 50) {
    riskIndicators.push({ level: 'medium', label: `Only ${buyerVerificationRate}% of buyers verified` });
  }

  return {
    type: 'board',
    title: 'Board Report',
    generatedAt: new Date().toISOString(),
    executiveSummary: {
      activeProjects: projects.filter(p => p.status === 'active').length,
      totalProjects: projects.length,
      capitalDeployed: overview.totalAllocatedCapital,
      totalInvested: overview.totalInvestedCapital,
      totalRevenue: overview.totalRevenue,
      totalDistributed
    },
    financialMetrics: {
      treasuryBalance: overview.treasuryBalance,
      availableLiquidity: overview.availableLiquidity,
      capitalUtilizationPercent: overview.capitalUtilizationPercent,
      netPlatformPosition: overview.netPlatformPosition,
      outstandingPayments
    },
    riskIndicators,
    governanceMetrics: {
      pendingApprovals,
      totalApprovals: approvals.length,
      milestoneCompletionRate,
      activeContracts: contracts.length,
      verifiedBuyers,
      totalBuyers: buyers.length,
      buyerVerificationRate
    }
  };
}

// Dispatch helper used by the route.
export async function buildReport(kind, params) {
  if (kind === 'monthly') return buildMonthlyReport(params);
  if (kind === 'quarterly') return buildQuarterlyReport(params);
  if (kind === 'board') return buildBoardReport();
  throw Object.assign(new Error(`unknown report kind: ${kind}`), { httpStatus: 400 });
}
