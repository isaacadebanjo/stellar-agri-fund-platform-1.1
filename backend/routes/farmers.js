import { Router } from 'express';
import Farmer from '../models/Farmer.js';
import Project from '../models/Project.js';
import Payout from '../models/Payout.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { sum } from '../services/money.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

async function enrich(farmer, payouts, projectsById) {
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
  return {
    id: farmer._id,
    name: farmer.name,
    walletId: farmer.walletId || '',
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
  const out = await Promise.all(farmers.map(f => enrich(f, payouts, projectsById)));
  res.json(out);
}));

r.post('/', asyncH(async (req, res) => {
  const { name, walletId, assignedProjects } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const farmer = await Farmer.create({
    name: name.trim(),
    walletId: walletId || '',
    assignedProjects: Array.isArray(assignedProjects) ? assignedProjects : []
  });
  // First-load enrich (no payouts yet)
  const projects = await Project.find({ _id: { $in: farmer.assignedProjects } }).lean();
  const projectsById = new Map(projects.map(p => [p._id, p]));
  const enriched = await enrich(farmer.toObject(), [], projectsById);

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.CREATE_FARMER,
    entityType: EntityTypes.FARMER,
    entityId: farmer._id.toString(),
    description: `Farmer "${farmer.name}" created with wallet ID "${farmer.walletId || 'N/A'}"`,
    status: ActivityStatus.SUCCESS,
    metadata: {
      farmerName: farmer.name,
      walletId: farmer.walletId,
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
