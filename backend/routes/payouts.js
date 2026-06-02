import { Router } from 'express';
import Payout from '../models/Payout.js';
import Project from '../models/Project.js';
import Farmer from '../models/Farmer.js';
import Transaction from '../models/Transaction.js';
import { transferXLM, getLiveBalance, ASSET, NETWORK } from '../services/stellar.js';
import { getTreasury } from '../config/seed.js';
import { ensureFarmerWallet } from '../services/farmerWallet.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { moneyLimiter } from '../middleware/rateLimit.js';
import { paginate, listResponse } from '../services/pagination.js';
import { amount, id } from '../services/validate.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

// Opt-in pagination: full array by default, `{ data, pagination }` when asked.
r.get('/', asyncH(async (req, res) => {
  const pg = paginate(req.query);
  if (!pg) {
    const payouts = await Payout.find().sort({ timestamp: -1 });
    return res.json(payouts.map(p => p.toJSON()));
  }
  const [payouts, total] = await Promise.all([
    Payout.find().sort({ timestamp: -1 }).skip(pg.skip).limit(pg.limit),
    Payout.countDocuments()
  ]);
  res.json(listResponse(payouts.map(p => p.toJSON()), total, pg));
}));

// Farmer payout: a REAL Stellar testnet transfer treasury → farmer wallet.
//
// Idempotent (Idempotency-Key) so a double-submit can't transfer twice. Flow
// mirrors invest/fund: reserve the project's allocation, write a pending payout
// + ledger row BEFORE funds move (so a mid-flight crash is auditable), submit
// the on-chain payment, then settle — or compensate (refund the reservation,
// mark failed) if the transfer is rejected.
r.post('/', moneyLimiter, idempotent('POST /api/payouts'), asyncH(async (req, res) => {
  const projectId = id(req.body?.projectId, 'projectId');
  const farmerId = id(req.body?.farmerId, 'farmerId');
  const value = amount(req.body?.amount);
  const note = typeof req.body?.note === 'string' ? req.body.note : '';

  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const farmer = await Farmer.findById(farmerId);
  if (!farmer) return res.status(404).json({ error: 'farmer not found' });

  const treasury = await getTreasury();
  if (!treasury) return res.status(500).json({ error: 'treasury not initialised' });

  // Make sure the farmer has an on-testnet wallet to receive the transfer.
  const farmerWallet = await ensureFarmerWallet(farmer);

  // Atomic, race-free reserve against the project's remaining allocation, so
  // concurrent payouts can't overspend (no read → write TOCTOU).
  const debited = await Project.findOneAndUpdate(
    { _id: project._id, $expr: { $gte: [{ $subtract: ['$allocated', '$spent'] }, value] } },
    { $inc: { spent: value } },
    { returnDocument: 'after' }
  );
  if (!debited) return res.status(400).json({ error: 'Project has insufficient allocated funds' });

  const timestamp = new Date();
  const payout = await Payout.create({
    projectId: project._id,
    projectName: project.name,
    farmerId: farmer._id,
    farmerName: farmer.name,
    farmerWallet: farmerWallet.publicKey,
    amount: value,
    asset: ASSET,
    note,
    status: 'pending',
    network: NETWORK,
    timestamp
  });
  const tx = await Transaction.create({
    stage: 'payout',
    amount: value,
    asset: ASSET,
    senderId: treasury._id,
    senderLabel: treasury.label,
    receiverId: farmer._id,
    receiverLabel: `Farmer: ${farmer.name}`,
    projectId: project._id,
    txHash: '',
    status: 'pending',
    network: NETWORK,
    timestamp
  });

  let result;
  try {
    result = await transferXLM({
      fromSecret: treasury.decryptSecret(),
      toPublicKey: farmerWallet.publicKey,
      amount: value
    });
  } catch (e) {
    // Compensate: refund the reserved allocation, mark records failed.
    await Project.findByIdAndUpdate(project._id, { $inc: { spent: -value } });
    payout.status = 'failed';
    await payout.save();
    tx.status = 'failed';
    tx.errorCode = e.code || '';
    await tx.save();

    logActivity({
      userId: req.user?.id,
      userRole: req.user?.role || 'system',
      actionType: ActivityTypes.PAYOUT,
      entityType: EntityTypes.PAYOUT,
      entityId: payout._id.toString(),
      description: `Payout of ${value} XLM to farmer "${farmer.name}" failed - ${e.message}`,
      status: ActivityStatus.FAILED,
      metadata: { amount: value, farmerName: farmer.name, projectId: project._id.toString(), error: e.message }
    });

    return res.status(400).json({ error: e.message });
  }

  // Settle the pending payout + ledger row with the real ledger result.
  payout.status = 'success';
  payout.txHash = result.txHash;
  payout.ledger = result.ledger;
  await payout.save();
  tx.status = 'success';
  tx.txHash = result.txHash;
  tx.ledger = result.ledger;
  await tx.save();

  // Refresh the farmer wallet's balance from the network (best-effort).
  try {
    farmerWallet.balance = await getLiveBalance(farmerWallet.publicKey);
    await farmerWallet.save();
  } catch { /* live balance is non-critical here */ }

  // Auto-link the project to the farmer's assigned list (idempotent).
  await Farmer.updateOne({ _id: farmer._id }, { $addToSet: { assignedProjects: project._id } });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.PAYOUT,
    entityType: EntityTypes.PAYOUT,
    entityId: payout._id.toString(),
    description: `Payout of ${value} XLM to farmer "${farmer.name}" from project "${project.name}"`,
    txHash: result.txHash,
    status: ActivityStatus.SUCCESS,
    metadata: {
      amount: value,
      farmerName: farmer.name,
      farmerWallet: farmerWallet.publicKey,
      projectId: project._id.toString(),
      projectName: project.name,
      txHash: result.txHash
    }
  });

  res.status(201).json(payout.toJSON());
}));

export default r;
