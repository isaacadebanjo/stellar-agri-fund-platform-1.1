import { Router } from 'express';
import Distribution from '../models/Distribution.js';
import Investor from '../models/Investor.js';
import Project from '../models/Project.js';
import Revenue from '../models/Revenue.js';
import Transaction from '../models/Transaction.js';
import { asyncH } from './_async.js';

const r = Router();

// Compute each investor's share of total invested capital across the treasury.
// Investors fund the treasury, the treasury allocates to projects — there is no
// per-investor-per-project link, so we approximate share-of-pool.
async function investorShares() {
  const investors = await Investor.find().lean();
  const investorByWallet = new Map(investors.map(i => [i.walletId, i._id]));

  const txAgg = await Transaction.aggregate([
    { $match: { stage: 'investment' } },
    { $group: { _id: '$senderId', total: { $sum: '$amount' } } }
  ]);
  const totals = {};
  for (const row of txAgg) {
    const investorId = investorByWallet.get(row._id);
    if (!investorId) continue;
    totals[investorId] = (totals[investorId] || 0) + row.total;
  }
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);
  return Object.entries(totals).map(([investorId, invested]) => ({
    investorId,
    invested: +invested.toFixed(2),
    sharePercent: grandTotal > 0 ? +(invested / grandTotal * 100).toFixed(4) : 0
  }));
}

async function enrichDistribution(d) {
  const [inv, proj] = await Promise.all([
    Investor.findById(d.investorId).lean(),
    Project.findById(d.projectId).lean()
  ]);
  return {
    ...d.toJSON?.() ?? d,
    investorName: inv?.name || 'Unknown',
    projectName: proj?.name || 'Unknown'
  };
}

r.get('/', asyncH(async (req, res) => {
  const { investorId, projectId } = req.query;
  const filter = {};
  if (investorId) filter.investorId = investorId;
  if (projectId) filter.projectId = projectId;
  const dists = await Distribution.find(filter).sort({ timestamp: -1 });

  // Bulk fetch investor + project names to avoid N+1.
  const invIds = [...new Set(dists.map(d => d.investorId))];
  const projIds = [...new Set(dists.map(d => d.projectId))];
  const [investors, projects] = await Promise.all([
    Investor.find({ _id: { $in: invIds } }).lean(),
    Project.find({ _id: { $in: projIds } }).lean()
  ]);
  const invMap = new Map(investors.map(i => [i._id, i.name]));
  const projMap = new Map(projects.map(p => [p._id, p.name]));
  res.json(dists.map(d => ({
    ...d.toJSON(),
    investorName: invMap.get(d.investorId) || 'Unknown',
    projectName: projMap.get(d.projectId) || 'Unknown'
  })));
}));

// Preview the distribution split for a project without persisting it.
r.get('/preview/:projectId', asyncH(async (req, res) => {
  const project = await Project.findById(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const platformFeePercent = Number(req.query.platformFeePercent ?? 10);

  const revAgg = await Revenue.aggregate([
    { $match: { projectId: project._id } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const revenue = revAgg[0]?.total || 0;
  const payouts = project.spent;
  const grossProfit = revenue - payouts;
  const platformFee = grossProfit > 0 ? +(grossProfit * platformFeePercent / 100).toFixed(2) : 0;
  const netProfit = +(grossProfit - platformFee).toFixed(2);

  const shares = await investorShares();
  const breakdown = shares.map(s => ({
    ...s,
    estimatedReturn: netProfit > 0 ? +(netProfit * s.sharePercent / 100).toFixed(2) : 0
  }));

  res.json({
    projectId: project._id,
    projectName: project.name,
    revenue: +revenue.toFixed(2),
    payouts: +payouts.toFixed(2),
    grossProfit: +grossProfit.toFixed(2),
    platformFeePercent,
    platformFee,
    netProfit,
    investors: breakdown
  });
}));

// Generate (persist) distribution records for a project.
r.post('/generate', asyncH(async (req, res) => {
  const { projectId, platformFeePercent } = req.body || {};
  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const feePct = Number(platformFeePercent ?? 10);

  const revAgg = await Revenue.aggregate([
    { $match: { projectId: project._id } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const revenue = revAgg[0]?.total || 0;
  const payouts = project.spent;
  const grossProfit = revenue - payouts;
  if (grossProfit <= 0) {
    return res.status(400).json({ error: 'No profit available to distribute (revenue ≤ payouts).' });
  }
  const platformFee = +(grossProfit * feePct / 100).toFixed(2);
  const netProfit = +(grossProfit - platformFee).toFixed(2);

  const shares = await investorShares();
  if (shares.length === 0) {
    return res.status(400).json({ error: 'No investors with funded investments yet.' });
  }

  const now = new Date();
  const docs = shares
    .filter(s => s.sharePercent > 0)
    .map(s => ({
      investorId: s.investorId,
      projectId: project._id,
      amount: +(netProfit * s.sharePercent / 100).toFixed(2),
      sharePercent: s.sharePercent,
      platformFeePercent: feePct,
      grossProfit: +grossProfit.toFixed(2),
      netProfit,
      status: 'pending',
      timestamp: now
    }));
  const created = await Distribution.insertMany(docs);

  const enriched = await Promise.all(created.map(enrichDistribution));

  res.status(201).json({
    projectId: project._id,
    projectName: project.name,
    grossProfit: +grossProfit.toFixed(2),
    platformFee,
    netProfit,
    distributions: enriched
  });
}));

// Mark a distribution as paid (mock — no real transfer).
r.post('/:id/mark-paid', asyncH(async (req, res) => {
  const dist = await Distribution.findByIdAndUpdate(
    req.params.id,
    { status: 'paid', paidAt: new Date() },
    { new: true }
  );
  if (!dist) return res.status(404).json({ error: 'distribution not found' });
  res.json(await enrichDistribution(dist));
}));

export default r;
