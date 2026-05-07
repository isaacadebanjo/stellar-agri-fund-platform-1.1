import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';

const r = Router();

r.get('/', (req, res) => {
  const sorted = [...db.data.payouts].sort((a, b) =>
    new Date(b.timestamp) - new Date(a.timestamp)
  );
  res.json(sorted);
});

// Manual payout entry: project → farmer (must be linked to a registered farmer + project)
r.post('/', async (req, res) => {
  const { projectId, farmerId, amount, note } = req.body || {};
  const value = Number(amount);
  const project = db.data.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const farmer = db.data.farmers.find(f => f.id === farmerId);
  if (!farmer) return res.status(404).json({ error: 'farmer not found' });
  if (!value || value <= 0) return res.status(400).json({ error: 'amount > 0 required' });

  const remaining = project.allocated - project.spent;
  if (remaining < value) return res.status(400).json({ error: 'Project has insufficient allocated funds' });

  project.spent = +(project.spent + value).toFixed(2);

  // Auto-link the project to the farmer's assigned list.
  if (!Array.isArray(farmer.assignedProjects)) farmer.assignedProjects = [];
  if (!farmer.assignedProjects.includes(project.id)) farmer.assignedProjects.push(project.id);

  const payout = {
    id: nanoid(10),
    projectId: project.id,
    projectName: project.name,
    farmerId: farmer.id,
    farmerName: farmer.name,
    farmerWallet: farmer.walletId || '',
    amount: value,
    asset: 'USDC',
    note: note || '',
    timestamp: new Date().toISOString()
  };
  db.data.payouts.push(payout);

  // Mirror into the unified transactions ledger so the dashboard tells the full story.
  db.data.transactions.push({
    id: nanoid(10),
    stage: 'payout',
    amount: value,
    asset: 'USDC',
    senderId: project.id,
    senderLabel: `Project: ${project.name}`,
    receiverId: farmer.id,
    receiverLabel: `Farmer: ${farmer.name}`,
    projectId: project.id,
    txHash: 'mock_payout_' + Math.random().toString(36).slice(2, 12),
    timestamp: payout.timestamp
  });

  await db.write();
  res.status(201).json(payout);
});

export default r;
