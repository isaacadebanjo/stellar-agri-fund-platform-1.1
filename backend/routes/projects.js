import { Router } from 'express';
import Project from '../models/Project.js';
import Revenue from '../models/Revenue.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();

// Investor users see project names in their summary via the bulk lookup —
// list/create/edit are operational and stay admin-only.
r.use(requireRole('admin'));

function enrich(p, revenue) {
  const profit = revenue - p.spent;
  return {
    id: p._id,
    name: p.name,
    description: p.description || '',
    cropType: p.cropType || '',
    status: p.status || 'active',
    startDate: p.startDate || '',
    endDate: p.endDate || '',
    allocated: p.allocated,
    spent: p.spent,
    createdAt: p.createdAt,
    paidOut: p.spent,
    remaining: +(p.allocated - p.spent).toFixed(2),
    revenue: +revenue.toFixed(2),
    profit: +profit.toFixed(2)
  };
}

async function revenueByProject() {
  const grouped = await Revenue.aggregate([
    { $group: { _id: '$projectId', total: { $sum: '$amount' } } }
  ]);
  return new Map(grouped.map(g => [g._id, g.total]));
}

r.get('/', asyncH(async (req, res) => {
  const projects = await Project.find().sort({ createdAt: 1 }).lean();
  const revMap = await revenueByProject();
  res.json(projects.map(p => enrich(p, revMap.get(p._id) || 0)));
}));

r.post('/', asyncH(async (req, res) => {
  const { name, description, cropType, status, startDate, endDate } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const project = await Project.create({
    name,
    description: description || '',
    cropType: cropType || '',
    status: status || 'active',
    startDate: startDate || '',
    endDate: endDate || ''
  });

  // Log project creation
  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.CREATE_PROJECT,
    entityType: EntityTypes.PROJECT,
    entityId: project._id.toString(),
    description: `Created project "${name}"`,
    status: ActivityStatus.SUCCESS,
    metadata: {
      projectName: name,
      cropType: cropType || null,
      status: status || 'active'
    }
  });

  res.status(201).json(enrich(project.toObject(), 0));
}));

// Update project fields (status, dates, crop, etc.)
r.patch('/:id', asyncH(async (req, res) => {
  const allowed = ['name', 'description', 'cropType', 'status', 'startDate', 'endDate'];
  const update = {};
  for (const k of allowed) {
    if (req.body && req.body[k] !== undefined) update[k] = req.body[k];
  }
  const project = await Project.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true
  });
  if (!project) return res.status(404).json({ error: 'project not found' });

  // Log project update
  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.UPDATE_PROJECT,
    entityType: EntityTypes.PROJECT,
    entityId: project._id.toString(),
    description: `Updated project "${project.name}"`,
    status: ActivityStatus.SUCCESS,
    metadata: {
      projectName: project.name,
      updatedFields: Object.keys(update)
    }
  });

  const revAgg = await Revenue.aggregate([
    { $match: { projectId: project._id } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  res.json(enrich(project.toObject(), revAgg[0]?.total || 0));
}));

export default r;
