import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';

const r = Router();

// Compute each investor's share of total invested capital across the treasury.
// Investors fund the treasury, the treasury allocates to projects — there is no
// per-investor-per-project link, so we approximate share-of-pool.
function investorShares() {
  const totals = {};
  for (const tx of db.data.transactions) {
    if (tx.stage !== 'investment') continue;
    const inv = db.data.investors.find(i => i.walletId === tx.senderId);
    if (!inv) continue;
    totals[inv.id] = (totals[inv.id] || 0) + tx.amount;
  }
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);
  return Object.entries(totals).map(([investorId, invested]) => ({
    investorId,
    invested: +invested.toFixed(2),
    sharePercent: grandTotal > 0 ? +(invested / grandTotal * 100).toFixed(4) : 0
  }));
}

function enrich(d) {
  const inv = db.data.investors.find(i => i.id === d.investorId);
  const proj = db.data.projects.find(p => p.id === d.projectId);
  return {
    ...d,
    investorName: inv?.name || 'Unknown',
    projectName: proj?.name || 'Unknown'
  };
}

r.get('/', (req, res) => {
  const { investorId, projectId } = req.query;
  let rows = db.data.distributions;
  if (investorId) rows = rows.filter(d => d.investorId === investorId);
  if (projectId) rows = rows.filter(d => d.projectId === projectId);
  const sorted = [...rows].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(sorted.map(enrich));
});

// Preview the distribution split for a project without persisting it.
r.get('/preview/:projectId', (req, res) => {
  const project = db.data.projects.find(p => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const platformFeePercent = Number(req.query.platformFeePercent ?? 10);

  const revenue = db.data.revenue
    .filter(rev => rev.projectId === project.id)
    .reduce((s, rev) => s + rev.amount, 0);
  const payouts = project.spent;
  const grossProfit = revenue - payouts;
  const platformFee = grossProfit > 0 ? +(grossProfit * platformFeePercent / 100).toFixed(2) : 0;
  const netProfit = +(grossProfit - platformFee).toFixed(2);

  const shares = investorShares();
  const breakdown = shares.map(s => ({
    ...s,
    estimatedReturn: netProfit > 0 ? +(netProfit * s.sharePercent / 100).toFixed(2) : 0
  }));

  res.json({
    projectId: project.id,
    projectName: project.name,
    revenue: +revenue.toFixed(2),
    payouts: +payouts.toFixed(2),
    grossProfit: +grossProfit.toFixed(2),
    platformFeePercent,
    platformFee,
    netProfit,
    investors: breakdown
  });
});

// Generate (persist) distribution records for a project.
r.post('/generate', async (req, res) => {
  const { projectId, platformFeePercent } = req.body || {};
  const project = db.data.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const feePct = Number(platformFeePercent ?? 10);

  const revenue = db.data.revenue
    .filter(rev => rev.projectId === project.id)
    .reduce((s, rev) => s + rev.amount, 0);
  const payouts = project.spent;
  const grossProfit = revenue - payouts;
  if (grossProfit <= 0) {
    return res.status(400).json({ error: 'No profit available to distribute (revenue ≤ payouts).' });
  }
  const platformFee = +(grossProfit * feePct / 100).toFixed(2);
  const netProfit = +(grossProfit - platformFee).toFixed(2);

  const shares = investorShares();
  if (shares.length === 0) {
    return res.status(400).json({ error: 'No investors with funded investments yet.' });
  }

  const now = new Date().toISOString();
  const created = shares
    .filter(s => s.sharePercent > 0)
    .map(s => ({
      id: nanoid(10),
      investorId: s.investorId,
      projectId: project.id,
      amount: +(netProfit * s.sharePercent / 100).toFixed(2),
      sharePercent: s.sharePercent,
      platformFeePercent: feePct,
      grossProfit: +grossProfit.toFixed(2),
      netProfit,
      status: 'pending',
      timestamp: now
    }));

  db.data.distributions.push(...created);
  await db.write();
  res.status(201).json({
    projectId: project.id,
    projectName: project.name,
    grossProfit: +grossProfit.toFixed(2),
    platformFee,
    netProfit,
    distributions: created.map(enrich)
  });
});

// Mark a distribution as paid (mock — no real transfer).
r.post('/:id/mark-paid', async (req, res) => {
  const dist = db.data.distributions.find(d => d.id === req.params.id);
  if (!dist) return res.status(404).json({ error: 'distribution not found' });
  dist.status = 'paid';
  dist.paidAt = new Date().toISOString();
  await db.write();
  res.json(enrich(dist));
});

export default r;
