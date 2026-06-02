import { Router } from 'express';
import mongoose from 'mongoose';
import Payout from '../models/Payout.js';
import Project from '../models/Project.js';
import Farmer from '../models/Farmer.js';
import Transaction from '../models/Transaction.js';
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

// Manual payout entry: project → farmer (must be linked to a registered farmer
// + project). Idempotent (Idempotency-Key) so a double-submit can't create two
// payout records / double-debit the project. All writes (project debit, payout,
// ledger row, farmer link) run inside one Mongo transaction so a mid-way crash
// can't leave the project debited without a matching payout, or vice versa.
r.post('/', moneyLimiter, idempotent('POST /api/payouts'), asyncH(async (req, res) => {
  const projectId = id(req.body?.projectId, 'projectId');
  const farmerId = id(req.body?.farmerId, 'farmerId');
  const value = amount(req.body?.amount);
  const note = typeof req.body?.note === 'string' ? req.body.note : '';

  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const farmer = await Farmer.findById(farmerId);
  if (!farmer) return res.status(404).json({ error: 'farmer not found' });

  const timestamp = new Date();
  let payout;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Atomic, race-free debit: only succeeds while remaining (allocated -
      // spent) still covers `value`, so concurrent payouts can't overspend a
      // project's allocation (no read → write TOCTOU).
      const debited = await Project.findOneAndUpdate(
        { _id: project._id, $expr: { $gte: [{ $subtract: ['$allocated', '$spent'] }, value] } },
        { $inc: { spent: value } },
        { returnDocument: 'after', session }
      );
      if (!debited) {
        const err = new Error('Project has insufficient allocated funds');
        err.httpStatus = 400;
        throw err;
      }

      const [createdPayout] = await Payout.create([{
        projectId: project._id,
        projectName: project.name,
        farmerId: farmer._id,
        farmerName: farmer.name,
        farmerWallet: farmer.walletId || '',
        amount: value,
        asset: 'XLM',
        note,
        timestamp
      }], { session });
      payout = createdPayout;

      // Mirror into the unified transactions ledger so the dashboard tells the
      // full story. Farmers don't have on-chain wallets here, so this stays
      // internal book-keeping (no Stellar submission).
      await Transaction.create([{
        stage: 'payout',
        amount: value,
        asset: 'XLM',
        senderId: project._id,
        senderLabel: `Project: ${project.name}`,
        receiverId: farmer._id,
        receiverLabel: `Farmer: ${farmer.name}`,
        projectId: project._id,
        txHash: 'internal_payout_' + Math.random().toString(36).slice(2, 12),
        status: 'success',
        network: 'internal',
        timestamp
      }], { session });

      // Auto-link the project to the farmer's assigned list (idempotent).
      await Farmer.updateOne(
        { _id: farmer._id },
        { $addToSet: { assignedProjects: project._id } },
        { session }
      );
    });
  } catch (e) {
    if (e.httpStatus === 400) return res.status(400).json({ error: e.message });
    throw e;
  } finally {
    await session.endSession();
  }

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.PAYOUT,
    entityType: EntityTypes.PAYOUT,
    entityId: payout._id.toString(),
    description: `Payout of ${value} XLM to farmer "${farmer.name}" from project "${project.name}"`,
    status: ActivityStatus.SUCCESS,
    metadata: {
      amount: value,
      farmerName: farmer.name,
      projectId: project._id.toString(),
      projectName: project.name
    }
  });

  res.status(201).json(payout.toJSON());
}));

export default r;
