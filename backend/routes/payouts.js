import { Router } from 'express';
import Payout from '../models/Payout.js';
import Project from '../models/Project.js';
import Farmer from '../models/Farmer.js';
import Transaction from '../models/Transaction.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

r.get('/', asyncH(async (req, res) => {
  const payouts = await Payout.find().sort({ timestamp: -1 });
  res.json(payouts.map(p => p.toJSON()));
}));

// Manual payout entry: project → farmer (must be linked to a registered farmer + project)
r.post('/', asyncH(async (req, res) => {
  const { projectId, farmerId, amount, note } = req.body || {};
  const value = Number(amount);
  if (!value || value <= 0) return res.status(400).json({ error: 'amount > 0 required' });

  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const farmer = await Farmer.findById(farmerId);
  if (!farmer) return res.status(404).json({ error: 'farmer not found' });

  const remaining = project.allocated - project.spent;
  if (remaining < value) return res.status(400).json({ error: 'Project has insufficient allocated funds' });

  project.spent = +(project.spent + value).toFixed(2);
  await project.save();

  // Auto-link the project to the farmer's assigned list.
  if (!farmer.assignedProjects.includes(project._id)) {
    farmer.assignedProjects.push(project._id);
    await farmer.save();
  }

  const timestamp = new Date();
  const payout = await Payout.create({
    projectId: project._id,
    projectName: project.name,
    farmerId: farmer._id,
    farmerName: farmer.name,
    farmerWallet: farmer.walletId || '',
    amount: value,
    asset: 'XLM',
    note: note || '',
    timestamp
  });

  // Mirror into the unified transactions ledger so the dashboard tells the
  // full story. Farmers don't have on-chain wallets here, so this stays
  // internal book-keeping (no Stellar submission).
  await Transaction.create({
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
  });

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
