import { Router } from 'express';
import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import Investor from '../models/Investor.js';
import Wallet from '../models/Wallet.js';
import Project from '../models/Project.js';
import { transferXLM, getLiveBalance, ASSET, NETWORK } from '../services/stellar.js';
import { getTreasury } from '../config/seed.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { moneyLimiter } from '../middleware/rateLimit.js';
import { allocationGate, milestoneAllocationGate } from '../middleware/governance.js';
import { paginate, listResponse } from '../services/pagination.js';
import { amount, id } from '../services/validate.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

// Newest-first transaction ledger. Backward compatible: with no `page`/`limit`
// query it returns the full array (existing consumers); when paginated it
// returns a `{ data, pagination }` envelope.
r.get('/', asyncH(async (req, res) => {
  const pg = paginate(req.query);
  const filter = {};
  if (req.query.stage && req.query.stage !== 'all') filter.stage = req.query.stage;
  if (!pg) {
    const txs = await Transaction.find(filter).sort({ timestamp: -1 });
    return res.json(txs.map(t => t.toJSON()));
  }
  const [txs, total] = await Promise.all([
    Transaction.find(filter).sort({ timestamp: -1 }).skip(pg.skip).limit(pg.limit),
    Transaction.countDocuments(filter)
  ]);
  res.json(listResponse(txs.map(t => t.toJSON()), total, pg));
}));

// Investor → Treasury: real Stellar testnet payment.
// Idempotent (Idempotency-Key) so a double-submit can't transfer twice; a
// pending ledger row is written BEFORE the transfer so a mid-flight crash is
// auditable/reconcilable instead of moving funds with no record.
r.post('/invest', moneyLimiter, idempotent('POST /api/transactions/invest'), asyncH(async (req, res) => {
  const investorId = id(req.body?.investorId, 'investorId');
  const value = amount(req.body?.amount);

  const investor = await Investor.findById(investorId);
  if (!investor) return res.status(404).json({ error: 'investor not found' });

  const investorWallet = await Wallet.findById(investor.walletId);
  const treasury = await getTreasury();
  if (!investorWallet || !treasury) return res.status(500).json({ error: 'wallets not initialised' });

  // Pending ledger row recorded before any funds move.
  const tx = await Transaction.create({
    stage: 'investment',
    amount: value,
    asset: ASSET,
    senderId: investorWallet._id,
    senderLabel: investorWallet.label,
    receiverId: treasury._id,
    receiverLabel: treasury.label,
    projectId: null,
    txHash: '',
    status: 'pending',
    network: NETWORK
  });

  let result;
  try {
    result = await transferXLM({
      fromSecret: investorWallet.decryptSecret(),
      toPublicKey: treasury.publicKey,
      amount: value
    });
  } catch (e) {
    tx.status = 'failed';
    tx.errorCode = e.code || '';
    await tx.save();

    logActivity({
      userId: req.user?.id,
      userRole: req.user?.role || 'system',
      actionType: ActivityTypes.INVESTMENT,
      entityType: EntityTypes.TRANSACTION,
      entityId: tx._id.toString(),
      description: `Investment failed: investor ${investor.name} could not transfer ${value} XLM - ${e.message}`,
      status: ActivityStatus.FAILED,
      metadata: {
        investorId: investor._id.toString(),
        investorName: investor.name,
        amount: value,
        error: e.message
      }
    });

    return res.status(400).json({ error: e.message, transaction: tx.toJSON() });
  }

  // Settle the pending row with the real ledger result.
  tx.status = result.status;
  tx.txHash = result.txHash;
  tx.ledger = result.ledger;
  tx.network = result.network;
  await tx.save();

  // Refresh both balances from the network (source of truth).
  const [investorLive, treasuryLive] = await Promise.all([
    getLiveBalance(investorWallet.publicKey),
    getLiveBalance(treasury.publicKey)
  ]);
  investorWallet.balance = investorLive;
  treasury.balance = treasuryLive;
  await Promise.all([investorWallet.save(), treasury.save()]);

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
r.post('/allocate', moneyLimiter, milestoneAllocationGate, allocationGate, idempotent('POST /api/transactions/allocate'), asyncH(async (req, res) => {
  const projectId = id(req.body?.projectId, 'projectId');
  const value = amount(req.body?.amount);

  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const treasury = await getTreasury();
  if (!treasury) return res.status(500).json({ error: 'treasury not initialised' });

  // Atomic, race-free book-keeping. The conditional `$gte` debit prevents
  // concurrent allocations from overspending the treasury (no read → write
  // TOCTOU); the session ties the treasury debit, project credit, and ledger
  // row into a single all-or-nothing transaction.
  let tx;
  let newTreasuryBalance;
  let newProjectAllocated;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const debited = await Wallet.findOneAndUpdate(
        { _id: treasury._id, type: 'treasury', balance: { $gte: value } },
        { $inc: { balance: -value } },
        { returnDocument: 'after', session }
      );
      if (!debited) {
        const err = new Error('Treasury has insufficient funds');
        err.httpStatus = 400;
        throw err;
      }
      newTreasuryBalance = debited.balance;

      const updatedProject = await Project.findByIdAndUpdate(
        project._id,
        { $inc: { allocated: value } },
        { returnDocument: 'after', session }
      );
      newProjectAllocated = updatedProject?.allocated;

      const created = await Transaction.create([{
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
      }], { session });
      tx = created[0];
    });
  } catch (e) {
    if (e.httpStatus === 400) return res.status(400).json({ error: e.message });
    throw e;
  } finally {
    await session.endSession();
  }

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
      newProjectAllocated,
      newTreasuryBalance
    }
  });

  res.status(201).json(tx.toJSON());
}));

export default r;
