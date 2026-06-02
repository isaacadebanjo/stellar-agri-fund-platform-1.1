import { Router } from 'express';
import mongoose from 'mongoose';
import Distribution from '../models/Distribution.js';
import DistributionRun from '../models/DistributionRun.js';
import Investor from '../models/Investor.js';
import Project from '../models/Project.js';
import Revenue from '../models/Revenue.js';
import Transaction from '../models/Transaction.js';
import Wallet from '../models/Wallet.js';
import { transferXLM, ASSET } from '../services/stellar.js';
import { getTreasury } from '../config/seed.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { moneyLimiter } from '../middleware/rateLimit.js';
import { paginate, listResponse } from '../services/pagination.js';
import { id, feePercent, optionalIsoDate } from '../services/validate.js';
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

  const pg = paginate(req.query);
  const cursor = Distribution.find(filter).sort({ timestamp: -1 });
  if (pg) cursor.skip(pg.skip).limit(pg.limit);
  const [dists, total] = await Promise.all([
    cursor,
    pg ? Distribution.countDocuments(filter) : Promise.resolve(0)
  ]);

  // Bulk fetch investor + project names to avoid N+1.
  const invIds = [...new Set(dists.map(d => d.investorId))];
  const projIds = [...new Set(dists.map(d => d.projectId))];
  const [investors, projects] = await Promise.all([
    Investor.find({ _id: { $in: invIds } }).lean(),
    Project.find({ _id: { $in: projIds } }).lean()
  ]);
  const invMap = new Map(investors.map(i => [i._id, i.name]));
  const projMap = new Map(projects.map(p => [p._id, p.name]));
  const rows = dists.map(d => ({
    ...d.toJSON(),
    investorName: invMap.get(d.investorId) || 'Unknown',
    projectName: projMap.get(d.projectId) || 'Unknown'
  }));
  res.json(pg ? listResponse(rows, total, pg) : rows);
}));

// Preview the distribution split for a project without persisting it.
r.get('/preview/:projectId', requireRole('admin'), asyncH(async (req, res) => {
  const project = await Project.findById(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const platformFeePercent = feePercent(req.query.platformFeePercent);

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

// Generate (persist) distribution records for a project over a reporting period.
//
// Duplicate guard: a DistributionRun with a unique (projectId, periodStart,
// periodEnd) index is created first inside the transaction; a second generate
// for the same project + period hits the unique index and returns 409, so an
// admin can't double-generate the same period (even on a concurrent submit).
r.post('/generate', requireRole('admin'), moneyLimiter, idempotent('POST /api/distributions/generate'), asyncH(async (req, res) => {
  const projectId = id(req.body?.projectId, 'projectId');
  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const feePct = feePercent(req.body?.platformFeePercent);

  // Reporting period. Defaults to the current calendar month-to-date when not
  // supplied; the UI prefills and shows it so the run is always explicit.
  const now = new Date();
  const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const periodStart = optionalIsoDate(req.body?.periodStart, 'periodStart') || defaultStart;
  const periodEnd = optionalIsoDate(req.body?.periodEnd, 'periodEnd') || defaultEnd;
  if (periodEnd < periodStart) {
    return res.status(400).json({ error: 'periodEnd must be on or after periodStart' });
  }

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

  const shares = (await investorShares()).filter(s => s.sharePercent > 0);
  if (shares.length === 0) {
    return res.status(400).json({ error: 'No investors with funded investments yet.' });
  }

  const now2 = new Date();
  let run;
  let created;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Unique (projectId, periodStart, periodEnd) — throws 11000 on a repeat.
      const [createdRun] = await DistributionRun.create([{
        projectId: project._id,
        periodStart,
        periodEnd,
        platformFeePercent: feePct,
        grossProfit: round(grossProfit),
        netProfit,
        investorCount: shares.length,
        timestamp: now2
      }], { session });
      run = createdRun;

      const docs = shares.map(s => ({
        investorId: s.investorId,
        projectId: project._id,
        amount: pct(netProfit, s.sharePercent),
        sharePercent: s.sharePercent,
        platformFeePercent: feePct,
        grossProfit: round(grossProfit),
        netProfit,
        status: 'pending',
        runId: run._id,
        periodStart,
        periodEnd,
        timestamp: now2
      }));
      created = await Distribution.insertMany(docs, { session });
    });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({
        error: 'Distributions have already been generated for this project and period.'
      });
    }
    throw e;
  } finally {
    await session.endSession();
  }

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
        platformFee,
        runId: run._id,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString()
      }
    });
  });

  res.status(201).json({
    projectId: project._id,
    projectName: project.name,
    runId: run._id,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    grossProfit: round(grossProfit),
    platformFee,
    netProfit,
    distributions: enriched
  });
}));

// Pay a distribution: real Stellar testnet transfer treasury → investor wallet.
// Idempotent (Idempotency-Key) and guarded by the persisted `paid` status so a
// retry can never double-pay an investor.
r.post('/:id/mark-paid', requireRole('admin'), moneyLimiter, idempotent('POST /api/distributions/:id/mark-paid'), asyncH(async (req, res) => {
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
