import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';

const r = Router();

function enrich(farmer) {
  const farmerPayouts = db.data.payouts.filter(p => p.farmerId === farmer.id);
  const totalReceived = farmerPayouts.reduce((s, p) => s + p.amount, 0);
  const projectIds = Array.from(new Set([
    ...(farmer.assignedProjects || []),
    ...farmerPayouts.map(p => p.projectId)
  ]));
  const projects = projectIds
    .map(pid => db.data.projects.find(p => p.id === pid))
    .filter(Boolean)
    .map(p => ({ id: p.id, name: p.name }));
  return {
    ...farmer,
    totalReceived: +totalReceived.toFixed(2),
    payoutCount: farmerPayouts.length,
    projects
  };
}

r.get('/', (req, res) => {
  res.json(db.data.farmers.map(enrich));
});

r.post('/', async (req, res) => {
  const { name, walletId, assignedProjects } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const farmer = {
    id: nanoid(8),
    name: name.trim(),
    walletId: walletId || '',
    assignedProjects: Array.isArray(assignedProjects) ? assignedProjects : [],
    createdAt: new Date().toISOString()
  };
  db.data.farmers.push(farmer);
  await db.write();
  res.status(201).json(enrich(farmer));
});

export default r;
