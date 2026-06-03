import { Router } from 'express';
import Revenue from '../models/Revenue.js';
import Project from '../models/Project.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { revenueAdjustmentGate } from '../middleware/governance.js';
import { amount, id } from '../services/validate.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

r.get('/', asyncH(async (req, res) => {
  const { projectId } = req.query;
  const filter = projectId ? { projectId } : {};
  const [rows, projects] = await Promise.all([
    Revenue.find(filter).sort({ timestamp: -1 }),
    Project.find().lean()
  ]);
  const nameById = new Map(projects.map(p => [p._id, p.name]));
  res.json(rows.map(rec => ({
    ...rec.toJSON(),
    projectName: nameById.get(rec.projectId) || 'Unknown'
  })));
}));

r.post('/', revenueAdjustmentGate, asyncH(async (req, res) => {
  const projectId = id(req.body?.projectId, 'projectId');
  const value = amount(req.body?.amount);
  const source = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });

  const record = await Revenue.create({
    projectId,
    amount: value,
    source
  });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.REVENUE_ENTRY,
    entityType: EntityTypes.REVENUE,
    entityId: record._id.toString(),
    description: `Revenue entry of ${value} XLM for project "${project.name}" from source "${source || 'N/A'}"`,
    status: ActivityStatus.SUCCESS,
    metadata: {
      amount: value,
      source: source || null,
      projectId: project._id.toString(),
      projectName: project.name
    }
  });

  res.status(201).json({ ...record.toJSON(), projectName: project.name });
}));

export default r;
