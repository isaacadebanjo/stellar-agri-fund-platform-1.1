import { Router } from 'express';
import Investor from '../models/Investor.js';
import Project from '../models/Project.js';
import Farmer from '../models/Farmer.js';
import Payout from '../models/Payout.js';
import Revenue from '../models/Revenue.js';
import Transaction from '../models/Transaction.js';
import Distribution from '../models/Distribution.js';
import { getTreasury } from '../config/seed.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();
// Operational dashboard is admin-only. Investors get their own /investors/:id/summary.
r.use(requireRole('admin'));

r.get('/', asyncH(async (req, res) => {
  const [
    treasury,
    txStageAgg,
    payoutTotalAgg,
    revenueTotalAgg,
    counts,
    projects,
    revenueByProj,
    revenueByDay,
    payoutsByDay
  ] = await Promise.all([
    getTreasury(),
    Transaction.aggregate([
      { $group: { _id: '$stage', total: { $sum: '$amount' } } }
    ]),
    Payout.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    Revenue.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    Promise.all([
      Investor.countDocuments(),
      Project.countDocuments(),
      Transaction.countDocuments(),
      Payout.countDocuments(),
      Farmer.countDocuments(),
      Revenue.countDocuments(),
      Distribution.countDocuments()
    ]),
    Project.find().lean(),
    Revenue.aggregate([
      { $group: { _id: '$projectId', total: { $sum: '$amount' } } }
    ]),
    Revenue.aggregate([
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
        total: { $sum: '$amount' }
      } }
    ]),
    Payout.aggregate([
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
        total: { $sum: '$amount' }
      } }
    ])
  ]);

  const stageMap = Object.fromEntries(txStageAgg.map(s => [s._id, s.total]));
  const totalReceived = stageMap.investment || 0;
  const totalAllocated = stageMap.allocation || 0;
  const totalPaidOut = payoutTotalAgg[0]?.total || 0;
  const totalRevenue = revenueTotalAgg[0]?.total || 0;
  const estimatedProfit = totalRevenue - totalPaidOut;

  const [
    investorsCount, projectsCount, transactionsCount,
    payoutsCount, farmersCount, revenueCount, distributionsCount
  ] = counts;

  // Per-project breakdown for the bar chart.
  const revMap = new Map(revenueByProj.map(r => [r._id, r.total]));
  const projectBreakdown = projects.map(p => {
    const revenue = revMap.get(p._id) || 0;
    return {
      projectId: p._id,
      name: p.name,
      cropType: p.cropType || '',
      status: p.status || 'active',
      allocated: +p.allocated.toFixed(2),
      payouts: +p.spent.toFixed(2),
      revenue: +revenue.toFixed(2),
      profit: +(revenue - p.spent).toFixed(2)
    };
  });

  // Profit trend bucketed by day. Combine revenue (+) and payouts (-).
  const dayMap = {};
  for (const r of revenueByDay) {
    const day = r._id;
    dayMap[day] = dayMap[day] || { date: day, revenue: 0, payouts: 0 };
    dayMap[day].revenue = +(dayMap[day].revenue + r.total).toFixed(2);
  }
  for (const p of payoutsByDay) {
    const day = p._id;
    dayMap[day] = dayMap[day] || { date: day, revenue: 0, payouts: 0 };
    dayMap[day].payouts = +(dayMap[day].payouts + p.total).toFixed(2);
  }
  const profitTrend = Object.values(dayMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .reduce((acc, d) => {
      const prev = acc[acc.length - 1]?.cumulativeProfit || 0;
      const dailyProfit = +(d.revenue - d.payouts).toFixed(2);
      acc.push({
        ...d,
        dailyProfit,
        cumulativeProfit: +(prev + dailyProfit).toFixed(2)
      });
      return acc;
    }, []);

  res.json({
    treasury: treasury ? {
      id: treasury._id,
      publicKey: treasury.publicKey,
      balance: treasury.balance
    } : null,
    totals: {
      received: +totalReceived.toFixed(2),
      allocated: +totalAllocated.toFixed(2),
      paidOut: +totalPaidOut.toFixed(2),
      treasuryBalance: treasury?.balance || 0,
      revenue: +totalRevenue.toFixed(2),
      estimatedProfit: +estimatedProfit.toFixed(2)
    },
    counts: {
      investors: investorsCount,
      projects: projectsCount,
      transactions: transactionsCount,
      payouts: payoutsCount,
      farmers: farmersCount,
      revenueEntries: revenueCount,
      distributions: distributionsCount
    },
    projectBreakdown,
    profitTrend
  });
}));

export default r;
