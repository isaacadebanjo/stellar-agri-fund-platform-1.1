import { Router } from 'express';
import Yield from '../models/Yield.js';
import Distribution from '../models/Distribution.js';
import Transaction from '../models/Transaction.js';
import { asyncH } from './_async.js';
import { round, sum } from '../services/money.js';
import { amount as positiveAmount, feePercent, nonNegativeNumber } from '../services/validate.js';

// Investor ROI simulator. Pure what-if compute — no persistence, no money
// movement — so it's open to both admins and the investors themselves
// (global requireAuth in server.js still applies). Scenarios are grounded in
// the platform's own historical performance so the defaults aren't arbitrary.
const r = Router();

// Scenario yield multipliers applied to the investor's expected yield.
const SCENARIOS = [
  { key: 'best', label: 'Best Case', yieldMultiplier: 1.25 },
  { key: 'expected', label: 'Expected Case', yieldMultiplier: 1.0 },
  { key: 'worst', label: 'Worst Case', yieldMultiplier: 0.6 }
];

const DEFAULT_FEE = 10;

// Platform baseline used to pre-fill the simulator and anchor expectations.
async function getBaseline() {
  const [yields, distAgg, investAgg] = await Promise.all([
    Yield.find().lean(),
    Distribution.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    Transaction.aggregate([
      { $match: { stage: 'investment', status: 'success' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])
  ]);

  const expectedYield = sum(yields, y => y.expectedYield);
  const actualYield = sum(yields, y => y.actualYield);
  const avgYieldPerformancePercent = expectedYield > 0 ? round((actualYield / expectedYield) * 100) : 100;

  const totalInvested = round(investAgg[0]?.total || 0);
  const totalDistributed = round(distAgg[0]?.total || 0);
  const platformRoiPercent = totalInvested > 0 ? round((totalDistributed / totalInvested) * 100) : 0;

  // Suggested annual yield: lean on realised ROI when there's history, else a
  // conservative default for a fresh platform.
  const suggestedYieldPercent = platformRoiPercent > 0 ? platformRoiPercent : 12;

  return {
    platformRoiPercent,
    avgYieldPerformancePercent,
    suggestedYieldPercent,
    platformFeePercent: DEFAULT_FEE,
    totalInvested,
    totalDistributed
  };
}

r.get('/baseline', asyncH(async (req, res) => {
  res.json(await getBaseline());
}));

// POST /api/simulator/roi
// body: { investmentAmount, durationMonths, expectedYieldPercent, platformFeePercent? }
r.post('/roi', asyncH(async (req, res) => {
  const investmentAmount = positiveAmount(req.body?.investmentAmount, 'investmentAmount');
  const durationMonths = positiveAmount(req.body?.durationMonths, 'durationMonths');
  const expectedYieldPercent = nonNegativeNumber(req.body?.expectedYieldPercent ?? 0, 'expectedYieldPercent');
  const fee = feePercent(req.body?.platformFeePercent, DEFAULT_FEE);

  // expectedYieldPercent is an annual rate; pro-rate it over the holding period.
  const periodFraction = durationMonths / 12;

  const scenarios = SCENARIOS.map(s => {
    const effectiveYieldPercent = round(expectedYieldPercent * s.yieldMultiplier);
    const grossRevenue = round(investmentAmount * (effectiveYieldPercent / 100) * periodFraction);
    const platformFee = round((grossRevenue * fee) / 100);
    const netReturns = round(grossRevenue - platformFee);
    const roiPercent = round((netReturns / investmentAmount) * 100);
    const annualizedRoiPercent = durationMonths > 0 ? round(roiPercent / periodFraction) : 0;
    return {
      key: s.key,
      label: s.label,
      effectiveYieldPercent,
      projectedRevenue: grossRevenue,
      platformFee,
      projectedReturns: netReturns,
      projectedRoiPercent: roiPercent,
      annualizedRoiPercent,
      endingValue: round(investmentAmount + netReturns)
    };
  });

  res.json({
    inputs: { investmentAmount, durationMonths, expectedYieldPercent, platformFeePercent: fee },
    scenarios,
    baseline: await getBaseline()
  });
}));

export default r;
