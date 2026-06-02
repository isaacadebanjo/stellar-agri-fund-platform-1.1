import { Router } from 'express';
import Investor from '../models/Investor.js';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import Distribution from '../models/Distribution.js';
import Project from '../models/Project.js';
import { createFundedWallet, transferXLM, getLiveBalance, ASSET, NETWORK } from '../services/stellar.js';
import { getTreasury } from '../config/seed.js';
import { asyncH } from './_async.js';
import { requireRole, requireSelfOrAdmin } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { moneyLimiter } from '../middleware/rateLimit.js';
import { paginate, listResponse } from '../services/pagination.js';
import { amount } from '../services/validate.js';
import { round, sum } from '../services/money.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();

// List + create are admin-only. Opt-in pagination (see services/pagination.js):
// full array by default, `{ data, pagination }` when page/limit is supplied.
r.get('/', requireRole('admin'), asyncH(async (req, res) => {
  const pg = paginate(req.query);
  const query = Investor.find().sort({ createdAt: 1 });
  if (pg) query.skip(pg.skip).limit(pg.limit);
  const [investors, total] = await Promise.all([
    query,
    pg ? Investor.countDocuments() : Promise.resolve(0)
  ]);
  const walletIds = investors.map(i => i.walletId);
  const wallets = await Wallet.find({ _id: { $in: walletIds } });
  const walletById = new Map(wallets.map(w => [w._id, w.toJSON()]));
  const rows = investors.map(inv => ({ ...inv.toJSON(), wallet: walletById.get(inv.walletId) || null }));
  res.json(pg ? listResponse(rows, total, pg) : rows);
}));

r.post('/', requireRole('admin'), asyncH(async (req, res) => {
  const { name, email } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });

  // Real Stellar testnet: friendbot funds the new wallet with ~10000 XLM
  // so it can transact immediately. Network call — takes a few seconds.
  const funded = await createFundedWallet();
  const wallet = await Wallet.create({
    label: `${name} Wallet`,
    publicKey: funded.publicKey,
    secret: funded.secret,
    type: 'investor',
    balance: funded.balance
  });
  const investor = await Investor.create({
    name,
    email: email || '',
    walletId: wallet._id
  });

  // Log activity
  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.CREATE_INVESTOR,
    entityType: EntityTypes.INVESTOR,
    entityId: investor._id.toString(),
    description: `Created investor "${name}" with wallet ${wallet.publicKey.slice(0, 8)}...`,
    status: ActivityStatus.SUCCESS,
    metadata: {
      investorName: name,
      email: email || null,
      walletId: wallet._id.toString(),
      publicKey: wallet.publicKey
    }
  });

  res.status(201).json({ ...investor.toJSON(), wallet: wallet.toJSON() });
}));

// Aggregated activity summary for a single investor.
// Admins can view any investor; investor users only their own.
r.get('/:id/summary', requireSelfOrAdmin(req => req.params.id), asyncH(async (req, res) => {
  const investor = await Investor.findById(req.params.id);
  if (!investor) return res.status(404).json({ error: 'investor not found' });
  const wallet = await Wallet.findById(investor.walletId);

  // Custodial investors have a server-managed Wallet. Non-custodial investors
  // connected their own wallet — show its live testnet balance from Horizon.
  let walletInfo = wallet
    ? { id: wallet._id, publicKey: wallet.publicKey, balance: wallet.balance, custodial: true }
    : null;
  if (!walletInfo && investor.stellarPublicKey) {
    let liveBalance = 0;
    try {
      liveBalance = await getLiveBalance(investor.stellarPublicKey);
    } catch { /* unfunded / Horizon unreachable — fall back to 0 */ }
    walletInfo = { id: null, publicKey: investor.stellarPublicKey, balance: liveBalance, custodial: false };
  }

  const investmentTxs = await Transaction.find({
    stage: 'investment',
    senderId: investor.walletId
  }).sort({ timestamp: -1 });
  const totalInvested = sum(investmentTxs, t => t.amount);

  const dists = await Distribution.find({ investorId: investor._id }).sort({ timestamp: -1 });
  const totalReturns = sum(dists, d => d.amount);
  const paidReturns = sum(dists.filter(d => d.status === 'paid'), d => d.amount);
  const pendingReturns = sum(dists.filter(d => d.status !== 'paid'), d => d.amount);

  const projectIds = Array.from(new Set(dists.map(d => d.projectId)));
  const projectDocs = await Project.find({ _id: { $in: projectIds } });
  const projects = projectIds.map(pid => {
    const p = projectDocs.find(x => x._id === pid);
    if (!p) return null;
    const investorShareInProject = sum(
      dists.filter(d => d.projectId === pid),
      d => d.amount
    );
    return {
      id: p._id,
      name: p.name,
      cropType: p.cropType || '',
      status: p.status || 'active',
      estimatedReturn: round(investorShareInProject)
    };
  }).filter(Boolean);

  const currentEstimatedValue = round(
    (walletInfo?.balance || 0) + totalInvested + totalReturns
  );

  res.json({
    investor: {
      id: investor._id,
      name: investor.name,
      email: investor.email,
      custodial: investor.custodial !== false,
      stellarPublicKey: investor.stellarPublicKey || null
    },
    wallet: walletInfo,
    totals: {
      invested: round(totalInvested),
      returns: round(totalReturns),
      paidReturns: round(paidReturns),
      pendingReturns: round(pendingReturns),
      currentEstimatedValue,
      projectsCount: projects.length,
      transactionsCount: investmentTxs.length
    },
    projects,
    transactions: investmentTxs.map(t => t.toJSON()),
    distributions: dists.map(d => {
      const proj = projectDocs.find(p => p._id === d.projectId);
      return { ...d.toJSON(), projectName: proj?.name || 'Unknown' };
    })
  });
}));

// Top up an investor wallet by sending real XLM from the treasury on testnet.
// Records a Transaction with the real ledger hash + status.
r.post('/:id/fund', requireRole('admin'), moneyLimiter, idempotent('POST /api/investors/:id/fund'), asyncH(async (req, res) => {
  const investor = await Investor.findById(req.params.id);
  if (!investor) return res.status(404).json({ error: 'investor not found' });
  const amountValue = amount(req.body?.amount);

  const investorWallet = await Wallet.findById(investor.walletId);
  const treasury = await getTreasury();
  if (!investorWallet || !treasury) {
    return res.status(500).json({ error: 'wallets not initialised' });
  }

  // Pending ledger row recorded before any funds move, so a mid-flight crash
  // is auditable instead of an untracked treasury → investor transfer.
  const tx = await Transaction.create({
    stage: 'investment', // closest existing bucket; treasury → investor top-up
    amount: amountValue,
    asset: ASSET,
    senderId: treasury._id,
    senderLabel: treasury.label,
    receiverId: investorWallet._id,
    receiverLabel: investorWallet.label,
    projectId: null,
    txHash: '',
    status: 'pending',
    network: NETWORK
  });

  let result;
  try {
    result = await transferXLM({
      fromSecret: treasury.decryptSecret(),
      toPublicKey: investorWallet.publicKey,
      amount: amountValue
    });
  } catch (e) {
    tx.status = 'failed';
    tx.errorCode = e.code || '';
    await tx.save();

    // Log failed funding attempt
    logActivity({
      userId: req.user?.id,
      userRole: req.user?.role || 'system',
      actionType: ActivityTypes.FUND_WALLET,
      entityType: EntityTypes.WALLET,
      entityId: investorWallet._id.toString(),
      description: `Failed to fund investor wallet - ${e.message}`,
      status: ActivityStatus.FAILED,
      metadata: {
        amount: amountValue,
        error: e.message
      }
    });

    return res.status(400).json({ error: e.message });
  }

  // Settle the pending row with the real ledger result.
  tx.status = result.status;
  tx.txHash = result.txHash;
  tx.ledger = result.ledger;
  tx.network = result.network;
  await tx.save();

  // Refresh both balances from Horizon (single source of truth).
  const [treasuryLive, investorLive] = await Promise.all([
    getLiveBalance(treasury.publicKey),
    getLiveBalance(investorWallet.publicKey)
  ]);
  treasury.balance = treasuryLive;
  investorWallet.balance = investorLive;
  await Promise.all([treasury.save(), investorWallet.save()]);

  // Log successful funding
  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.FUND_WALLET,
    entityType: EntityTypes.WALLET,
    entityId: investorWallet._id.toString(),
    description: `Funded investor wallet with ${amountValue} XLM`,
    txHash: result.txHash,
    status: ActivityStatus.SUCCESS,
    metadata: {
      amount: amountValue,
      investorId: investor._id.toString(),
      investorName: investor.name,
      newBalance: investorWallet.balance
    }
  });

  res.json({ wallet: investorWallet.toJSON(), txHash: result.txHash, status: result.status });
}));

export default r;
