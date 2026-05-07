import { Router } from 'express';
import Revenue from '../models/Revenue.js';
import Project from '../models/Project.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';

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

r.post('/', asyncH(async (req, res) => {
  const { projectId, amount, source } = req.body || {};
  const value = Number(amount);
  if (!value || value <= 0) return res.status(400).json({ error: 'amount > 0 required' });
  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });

  const record = await Revenue.create({
    projectId,
    amount: value,
    source: (source || '').trim()
  });
  res.status(201).json({ ...record.toJSON(), projectName: project.name });
}));

export default r;
