// Executive operational KPIs. Extracted from routes/kpi.js so the same numbers
// can be reused by the presentation/snapshot layer without an HTTP round-trip.
// routes/kpi.js delegates to this — its response shape is unchanged.
import Project from '../models/Project.js';
import Yield from '../models/Yield.js';
import Revenue from '../models/Revenue.js';
import Distribution from '../models/Distribution.js';
import { getTreasuryOverview } from './treasuryAnalytics.js';
import { round, sum } from './money.js';

export async function getKpiOverview() {
  const [overview, projects, yields, revAgg, distAgg, yieldByProject] = await Promise.all([
    getTreasuryOverview(),
    Project.find().lean(),
    Yield.find().lean(),
    Revenue.aggregate([{ $group: { _id: '$projectId', total: { $sum: '$amount' } } }]),
    Distribution.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    Yield.aggregate([{ $group: { _id: '$projectId', actual: { $sum: '$actualYield' } } }])
  ]);

  const revenueByProject = new Map(revAgg.map(r2 => [r2._id, r2.total]));
  const yieldByProj = new Map(yieldByProject.map(y => [y._id, y.actual]));

  const totalHectares = sum(projects, p => p.hectares || 0);
  const activeProjects = projects.filter(p => (p.status || 'active') === 'active').length;
  const totalCost = sum(projects, p => p.spent || 0); // farmer payouts = operating cost
  const totalRevenue = sum(revAgg, x => x.total);
  const totalInvested = overview.totalInvestedCapital;
  const totalActualYield = sum(yields, y => y.actualYield);
  const totalDistributed = distAgg[0]?.total || 0;

  const grossProfit = round(totalRevenue - totalCost);
  const netProfit = round(grossProfit - totalDistributed);
  const perHa = (v) => (totalHectares > 0 ? round(v / totalHectares) : 0);

  return {
    totalHectares,
    activeProjects,
    projectCount: projects.length,
    yieldPerHectare: perHa(totalActualYield),
    revenuePerHectare: perHa(totalRevenue),
    costPerHectare: perHa(totalCost),
    grossMarginPercent: totalRevenue > 0 ? round((grossProfit / totalRevenue) * 100) : 0,
    profitMarginPercent: totalRevenue > 0 ? round((netProfit / totalRevenue) * 100) : 0,
    investorRoiPercent: totalInvested > 0 ? round((totalDistributed / totalInvested) * 100) : 0,
    capitalUtilizationPercent: overview.capitalUtilizationPercent,
    totalRevenue: round(totalRevenue),
    totalCost: round(totalCost),
    grossProfit,
    netProfit,
    totalInvested: round(totalInvested),
    totalAllocated: round(overview.totalAllocatedCapital),
    totalDistributed: round(totalDistributed),
    byProject: projects.map(p => {
      const revenue = round(revenueByProject.get(p._id) || 0);
      const cost = round(p.spent || 0);
      return {
        name: p.name,
        hectares: p.hectares || 0,
        revenue,
        cost,
        profit: round(revenue - cost),
        actualYield: round(yieldByProj.get(p._id) || 0)
      };
    })
  };
}
