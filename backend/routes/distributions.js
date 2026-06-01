import { Router } from 'express';
import Distribution from '../models/Distribution.js';
import Investor from '../models/Investor.js';
import Project from '../models/Project.js';
import Revenue from '../models/Revenue.js';
import Transaction from '../models/Transaction.js';
import Wallet from '../models/Wallet.js';
import { transferXLM, ASSET, NETWORK } from '../services/stellar.js';
import { getTreasury } from '../config/seed.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { round, sum, add, sub, pct } from '../services/money.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

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
    totals[investorId] = add(totals[investorId] || 0, row.total);
  }
  const grandTotal = sum(Object.values(totals));
  return Object.entries(totals).map(([investorId, invested]) => ({
    investorId,
    invested: round(invested),
    sharePercent: grandTotal > 0 ? round((invested / grandTotal) * 100, 4) : 0
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

  // Investor users can only see their own distributions, regardless of query.
  if (req.user.role === 'investor') {
    filter.investorId = req.user.investorId;
  }

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
r.get('/preview/:projectId', requireRole('admin'), asyncH(async (req, res) => {
  const project = await Project.findById(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const platformFeePercent = Number(req.query.platformFeePercent ?? 10);

  const revAgg = await Revenue.aggregate([
    { $match: { projectId: project._id } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const revenue = revAgg[0]?.total || 0;
  const payouts = project.spent;
  const grossProfit = sub(revenue, payouts);
  const platformFee = grossProfit > 0 ? pct(grossProfit, platformFeePercent) : 0;
  const netProfit = sub(grossProfit, platformFee);

  const shares = await investorShares();
  const breakdown = shares.map(s => ({
    ...s,
    estimatedReturn: netProfit > 0 ? pct(netProfit, s.sharePercent) : 0
  }));

  res.json({
    projectId: project._id,
    projectName: project.name,
    revenue: round(revenue),
    payouts: round(payouts),
    grossProfit: round(grossProfit),
    platformFeePercent,
    platformFee,
    netProfit,
    investors: breakdown
  });
}));

// Generate (persist) distribution records for a project.
r.post('/generate', requireRole('admin'), idempotent('POST /api/distributions/generate'), asyncH(async (req, res) => {
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
  const grossProfit = sub(revenue, payouts);
  if (grossProfit <= 0) {
    return res.status(400).json({ error: 'No profit available to distribute (revenue ≤ payouts).' });
  }
  const platformFee = pct(grossProfit, feePct);
  const netProfit = sub(grossProfit, platformFee);

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
      amount: pct(netProfit, s.sharePercent),
      sharePercent: s.sharePercent,
      platformFeePercent: feePct,
      grossProfit: round(grossProfit),
      netProfit,
      status: 'pending',
      timestamp: now
    }));
  const created = await Distribution.insertMany(docs);

  const enriched = await Promise.all(created.map(enrichDistribution));

  created.forEach((dist) => {
    logActivity({
      userId: req.user?.id,
      userRole: req.user?.role || 'system',
      actionType: ActivityTypes.DISTRIBUTION_GENERATED,
      entityType: EntityTypes.DISTRIBUTION,
      entityId: dist._id.toString(),
      description: `Distribution generated for project "${project.name}" - ${dist.amount} XLM allocated to investor`,
      status: ActivityStatus.SUCCESS,
      metadata: {
        projectId: project._id.toString(),
        projectName: project.name,
        investorId: dist.investorId.toString(),
        amount: dist.amount,
        sharePercent: dist.sharePercent,
        grossProfit: round(grossProfit),
        netProfit,
        platformFee
      }
    });
  });

  res.status(201).json({
    projectId: project._id,
    projectName: project.name,
    grossProfit: round(grossProfit),
    platformFee,
    netProfit,
    distributions: enriched
  });
}));

// Pay a distribution: real Stellar testnet transfer treasury → investor wallet.
// Idempotent (Idempotency-Key) and guarded by the persisted `paid` status so a
// retry can never double-pay an investor.
r.post('/:id/mark-paid', requireRole('admin'), idempotent('POST /api/distributions/:id/mark-paid'), asyncH(async (req, res) => {
  const dist = await Distribution.findById(req.params.id);
  if (!dist) return res.status(404).json({ error: 'distribution not found' });

  // Already settled — return current state without transferring again.
  if (dist.status === 'paid') {
    return res.json(await enrichDistribution(dist));
  }

  const [inv, proj] = await Promise.all([
    Investor.findById(dist.investorId).lean(),
    Project.findById(dist.projectId).lean()
  ]);
  if (!inv) return res.status(404).json({ error: 'investor not found' });

  const investorWallet = await Wallet.findById(inv.walletId);
  const treasury = await getTreasury();
  if (!investorWallet || !treasury) {
    return res.status(500).json({ error: 'wallets not initialised' });
  }

  let result;
  try {
    result = await transferXLM({
      fromSecret: treasury.decryptSecret(),
      toPublicKey: investorWallet.publicKey,
      amount: dist.amount
    });
  } catch (e) {
    logActivity({
      userId: req.user?.id,
      userRole: req.user?.role || 'system',
      actionType: ActivityTypes.DISTRIBUTION_PAID,
      entityType: EntityTypes.DISTRIBUTION,
      entityId: dist._id.toString(),
      description: `Distribution payout of ${dist.amount} XLM to "${inv.name}" failed - ${e.message}`,
      status: ActivityStatus.FAILED,
      metadata: { investorId: inv._id.toString(), amount: dist.amount, error: e.message }
    });
    return res.status(400).json({ error: e.message });
  }

  dist.status = 'paid';
  dist.paidAt = new Date();
  dist.txHash = result.txHash;
  dist.network = result.network;
  await dist.save();

  // Record the payout in the ledger so treasury analytics stays consistent.
  await Transaction.create({
    stage: 'payout',
    amount: dist.amount,
    asset: ASSET,
    senderId: treasury._id,
    senderLabel: treasury.label,
    receiverId: investorWallet._id,
    receiverLabel: investorWallet.label,
    projectId: dist.projectId,
    txHash: result.txHash,
    ledger: result.ledger,
    status: 'success',
    network: result.network
  });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.DISTRIBUTION_PAID,
    entityType: EntityTypes.DISTRIBUTION,
    entityId: dist._id.toString(),
    description: `Distribution of ${dist.amount} XLM paid to investor "${inv.name}" for project "${proj?.name || 'Unknown'}"`,
    txHash: result.txHash,
    status: ActivityStatus.SUCCESS,
    metadata: {
      projectId: proj?._id.toString(),
      projectName: proj?.name,
      investorId: inv._id.toString(),
      investorName: inv.name,
      amount: dist.amount,
      sharePercent: dist.sharePercent,
      paidAt: dist.paidAt,
      txHash: result.txHash
    }
  });

  res.json(await enrichDistribution(dist));
}));

export default r;
