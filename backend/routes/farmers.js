import { Router } from 'express';
import Farmer from '../models/Farmer.js';
import Project from '../models/Project.js';
import Payout from '../models/Payout.js';
import { asyncH } from './_async.js';

const r = Router();

async function enrich(farmer, payouts, projectsById) {
  const farmerPayouts = payouts.filter(p => p.farmerId === farmer._id);
  const totalReceived = farmerPayouts.reduce((s, p) => s + p.amount, 0);
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
    totalReceived: +totalReceived.toFixed(2),
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
  res.status(201).json(await enrich(farmer.toObject(), [], projectsById));
}));

export default r;
