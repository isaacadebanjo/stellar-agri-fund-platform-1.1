import { Router } from 'express';
import Transaction from '../models/Transaction.js';
import Investor from '../models/Investor.js';
import Wallet from '../models/Wallet.js';
import Project from '../models/Project.js';
import { transferXLM, getLiveBalance, ASSET, NETWORK } from '../services/stellar.js';
import { getTreasury } from '../config/seed.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

r.get('/', asyncH(async (req, res) => {
  const txs = await Transaction.find().sort({ timestamp: -1 });
  res.json(txs.map(t => t.toJSON()));
}));

// Investor → Treasury: real Stellar testnet payment.
r.post('/invest', asyncH(async (req, res) => {
  const { investorId, amount } = req.body || {};
  const value = Number(amount);
  if (!value || value <= 0) return res.status(400).json({ error: 'amount > 0 required' });

  const investor = await Investor.findById(investorId);
  if (!investor) return res.status(404).json({ error: 'investor not found' });

  const investorWallet = await Wallet.findById(investor.walletId);
  const treasury = await getTreasury();
  if (!investorWallet || !treasury) return res.status(500).json({ error: 'wallets not initialised' });

  let result;
  try {
    result = await transferXLM({
      fromSecret: investorWallet.secret,
      toPublicKey: treasury.publicKey,
      amount: value
    });
  } catch (e) {
    const failed = await Transaction.create({
      stage: 'investment',
      amount: value,
      asset: ASSET,
      senderId: investorWallet._id,
      senderLabel: investorWallet.label,
      receiverId: treasury._id,
      receiverLabel: treasury.label,
      projectId: null,
      txHash: '',
      status: 'failed',
      network: NETWORK,
      errorCode: e.code || ''
    });

    // Log failed investment
    logActivity({
      userId: req.user?.id,
      userRole: req.user?.role || 'system',
      actionType: ActivityTypes.INVESTMENT,
      entityType: EntityTypes.TRANSACTION,
      entityId: failed._id.toString(),
      description: `Investment failed: investor ${investor.name} could not transfer ${value} XLM - ${e.message}`,
      status: ActivityStatus.FAILED,
      metadata: {
        investorId: investor._id.toString(),
        investorName: investor.name,
        amount: value,
        error: e.message
      }
    });

    return res.status(400).json({ error: e.message, transaction: failed.toJSON() });
  }

  // Refresh both balances from the network.
  const [investorLive, treasuryLive] = await Promise.all([
    getLiveBalance(investorWallet.publicKey),
    getLiveBalance(treasury.publicKey)
  ]);
  investorWallet.balance = investorLive;
  treasury.balance = treasuryLive;
  await Promise.all([investorWallet.save(), treasury.save()]);

  const tx = await Transaction.create({
    stage: 'investment',
    amount: value,
    asset: ASSET,
    senderId: investorWallet._id,
    senderLabel: investorWallet.label,
    receiverId: treasury._id,
    receiverLabel: treasury.label,
    projectId: null,
    txHash: result.txHash,
    ledger: result.ledger,
    status: result.status,
    network: result.network
  });

  // Log successful investment
  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.INVESTMENT,
    entityType: EntityTypes.TRANSACTION,
    entityId: tx._id.toString(),
    description: `Investor ${investor.name} invested ${value} XLM to treasury`,
    txHash: result.txHash,
    status: ActivityStatus.SUCCESS,
    metadata: {
      investorId: investor._id.toString(),
      investorName: investor.name,
      amount: value,
      newWalletBalance: investorWallet.balance,
      newTreasuryBalance: treasury.balance
    }
  });

  res.status(201).json(tx.toJSON());
}));

// Treasury → Project allocation. Projects don't have on-chain wallets in this
// app — allocations are internal book-keeping against treasury balance.
r.post('/allocate', asyncH(async (req, res) => {
  const { projectId, amount } = req.body || {};
  const value = Number(amount);
  if (!value || value <= 0) return res.status(400).json({ error: 'amount > 0 required' });

  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const treasury = await getTreasury();
  if (!treasury) return res.status(500).json({ error: 'treasury not initialised' });
  if (treasury.balance < value) return res.status(400).json({ error: 'Treasury has insufficient funds' });

  treasury.balance = +(treasury.balance - value).toFixed(2);
  project.allocated = +(project.allocated + value).toFixed(2);
  await treasury.save();
  await project.save();

  const tx = await Transaction.create({
    stage: 'allocation',
    amount: value,
    asset: ASSET,
    senderId: treasury._id,
    senderLabel: treasury.label,
    receiverId: project._id,
    receiverLabel: `Project: ${project.name}`,
    projectId: project._id,
    txHash: 'internal_alloc_' + Math.random().toString(36).slice(2, 12),
    status: 'success',
    network: 'internal'
  });

  // Log successful allocation
  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.ALLOCATION,
    entityType: EntityTypes.TRANSACTION,
    entityId: tx._id.toString(),
    description: `Allocated ${value} XLM to project "${project.name}"`,
    txHash: tx.txHash,
    status: ActivityStatus.SUCCESS,
    metadata: {
      projectId: project._id.toString(),
      projectName: project.name,
      amount: value,
      newProjectAllocated: project.allocated,
      newTreasuryBalance: treasury.balance
    }
  });

  res.status(201).json(tx.toJSON());
}));

export default r;
