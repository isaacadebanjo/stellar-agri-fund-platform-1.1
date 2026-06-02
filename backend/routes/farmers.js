import { Router } from 'express';
import Farmer from '../models/Farmer.js';
import Project from '../models/Project.js';
import Payout from '../models/Payout.js';
import Wallet from '../models/Wallet.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { sum } from '../services/money.js';
import { nonEmptyString } from '../services/validate.js';
import { ensureFarmerWallet } from '../services/farmerWallet.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

function enrich(farmer, payouts, projectsById, walletById) {
  const farmerPayouts = payouts.filter(p => p.farmerId === farmer._id);
  const totalReceived = sum(farmerPayouts, p => p.amount);
  const projectIds = Array.from(new Set([
    ...(farmer.assignedProjects || []),
    ...farmerPayouts.map(p => p.projectId)
  ]));
  const projects = projectIds
    .map(pid => projectsById.get(pid))
    .filter(Boolean)
    .map(p => ({ id: p._id, name: p.name }));
  const wallet = farmer.walletId ? walletById.get(farmer.walletId) : null;
  return {
    id: farmer._id,
    name: farmer.name,
    walletId: farmer.walletId || '',
    // The farmer's custodial Stellar testnet wallet (auto-provisioned).
    publicKey: wallet?.publicKey || '',
    balance: wallet?.balance ?? 0,
    assignedProjects: farmer.assignedProjects || [],
    createdAt: farmer.createdAt,
    totalReceived,
    payoutCount: farmerPayouts.length,
    projects
  };
}

r.get('/', asyncH(async (req, res) => {
  const [farmers, payouts, projects] = await Promise.all([
    Farmer.find().sort({ createdAt: 1 }).lean(),
    Payout.find().lean(),
    Project.find().lean()
  ]);
  const projectsById = new Map(projects.map(p => [p._id, p]));
  const walletIds = farmers.map(f => f.walletId).filter(Boolean);
  const wallets = await Wallet.find({ _id: { $in: walletIds } }).lean();
  const walletById = new Map(wallets.map(w => [w._id, w]));
  res.json(farmers.map(f => enrich(f, payouts, projectsById, walletById)));
}));

r.post('/', asyncH(async (req, res) => {
  const name = nonEmptyString(req.body?.name, 'name');
  const assignedProjects = Array.isArray(req.body?.assignedProjects) ? req.body.assignedProjects : [];
  const farmer = await Farmer.create({ name, assignedProjects });

  // Provision a custodial, Friendbot-funded testnet wallet so the farmer can
  // actually receive on-chain payouts (mirrors how investors get a wallet).
  const wallet = await ensureFarmerWallet(farmer);

  const projects = await Project.find({ _id: { $in: farmer.assignedProjects } }).lean();
  const projectsById = new Map(projects.map(p => [p._id, p]));
  const walletById = new Map([[wallet._id, wallet.toObject ? wallet.toObject() : wallet]]);
  const enriched = enrich(farmer.toObject(), [], projectsById, walletById);

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.CREATE_FARMER,
    entityType: EntityTypes.FARMER,
    entityId: farmer._id.toString(),
    description: `Farmer "${farmer.name}" created with testnet wallet ${wallet.publicKey.slice(0, 8)}…`,
    status: ActivityStatus.SUCCESS,
    metadata: {
      farmerName: farmer.name,
      publicKey: wallet.publicKey,
      assignedProjectCount: farmer.assignedProjects.length,
      assignedProjectIds: farmer.assignedProjects.map(p => p.toString())
    }
  });

  res.status(201).json(enriched);
}));

r.delete('/:id', asyncH(async (req, res) => {
  const farmer = await Farmer.findById(req.params.id);
  if (!farmer) return res.status(404).json({ error: 'farmer not found' });

  const farmerName = farmer.name;
  const farmerId = farmer._id.toString();

  await Farmer.deleteOne({ _id: farmer._id });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.DELETE_FARMER,
    entityType: EntityTypes.FARMER,
    entityId: farmerId,
    description: `Farmer "${farmerName}" deleted`,
    status: ActivityStatus.SUCCESS,
    metadata: {
      farmerName,
      walletId: farmer.walletId,
      assignedProjectCount: farmer.assignedProjects?.length || 0,
      assignedProjectIds: (farmer.assignedProjects || []).map(p => p.toString())
    }
  });

  res.json({ message: 'Farmer deleted successfully' });
}));

export default r;
