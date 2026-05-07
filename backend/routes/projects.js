import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';

const r = Router();

function enrich(p) {
  const revenue = db.data.revenue
    .filter(r => r.projectId === p.id)
    .reduce((s, r) => s + r.amount, 0);
  return {
    ...p,
    cropType: p.cropType || '',
    status: p.status || 'active',
    startDate: p.startDate || '',
    endDate: p.endDate || '',
    paidOut: p.spent,
    remaining: +(p.allocated - p.spent).toFixed(2),
    revenue: +revenue.toFixed(2),
    profit: +(revenue - p.spent).toFixed(2)
  };
}

r.get('/', (req, res) => {
  res.json(db.data.projects.map(enrich));
});

r.post('/', async (req, res) => {
  const { name, description, cropType, status, startDate, endDate } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const project = {
    id: nanoid(8),
    name,
    description: description || '',
    cropType: cropType || '',
    status: status || 'active',
    startDate: startDate || '',
    endDate: endDate || '',
    allocated: 0,
    spent: 0,
    createdAt: new Date().toISOString()
  };
  db.data.projects.push(project);
  await db.write();
  res.status(201).json(enrich(project));
});

// Update project fields (status, dates, crop, etc.)
r.patch('/:id', async (req, res) => {
  const project = db.data.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const allowed = ['name', 'description', 'cropType', 'status', 'startDate', 'endDate'];
  for (const k of allowed) {
    if (req.body && req.body[k] !== undefined) project[k] = req.body[k];
  }
  await db.write();
  res.json(enrich(project));
});

export default r;
