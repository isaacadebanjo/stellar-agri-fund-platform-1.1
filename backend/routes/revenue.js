import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';

const r = Router();

r.get('/', (req, res) => {
  const { projectId } = req.query;
  let rows = db.data.revenue;
  if (projectId) rows = rows.filter(r => r.projectId === projectId);
  const enriched = rows
    .map(rec => ({
      ...rec,
      projectName: db.data.projects.find(p => p.id === rec.projectId)?.name || 'Unknown'
    }))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(enriched);
});

r.post('/', async (req, res) => {
  const { projectId, amount, source } = req.body || {};
  const value = Number(amount);
  const project = db.data.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  if (!value || value <= 0) return res.status(400).json({ error: 'amount > 0 required' });

  const record = {
    id: nanoid(10),
    projectId,
    amount: value,
    source: (source || '').trim(),
    timestamp: new Date().toISOString()
  };
  db.data.revenue.push(record);
  await db.write();
  res.status(201).json({ ...record, projectName: project.name });
});

export default r;
