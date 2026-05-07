import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db, getTreasury } from '../db.js';
import { simulateTransfer } from '../services/stellar.js';

const r = Router();

r.get('/', (req, res) => {
  const sorted = [...db.data.transactions].sort((a, b) =>
    new Date(b.timestamp) - new Date(a.timestamp)
  );
  res.json(sorted);
});

// Investor → Treasury
r.post('/invest', async (req, res) => {
  const { investorId, amount } = req.body || {};
  const value = Number(amount);
  const investor = db.data.investors.find(i => i.id === investorId);
  if (!investor) return res.status(404).json({ error: 'investor not found' });
  if (!value || value <= 0) return res.status(400).json({ error: 'amount > 0 required' });

  const investorWallet = db.data.wallets.find(w => w.id === investor.walletId);
  const treasury = getTreasury();

  try {
    const meta = simulateTransfer({ from: investorWallet, to: treasury, amount: value });
    const tx = {
      id: nanoid(10),
      stage: 'investment',
      amount: value,
      asset: 'USDC',
      senderId: investorWallet.id,
      senderLabel: investorWallet.label,
      receiverId: treasury.id,
      receiverLabel: treasury.label,
      projectId: null,
      txHash: meta.txHash,
      timestamp: new Date().toISOString()
    };
    db.data.transactions.push(tx);
    await db.write();
    res.status(201).json(tx);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Treasury → Project allocation (no real wallet — project balance is tracked on the project record)
r.post('/allocate', async (req, res) => {
  const { projectId, amount } = req.body || {};
  const value = Number(amount);
  const project = db.data.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  if (!value || value <= 0) return res.status(400).json({ error: 'amount > 0 required' });

  const treasury = getTreasury();
  if (treasury.balance < value) return res.status(400).json({ error: 'Treasury has insufficient funds' });

  treasury.balance = +(treasury.balance - value).toFixed(2);
  project.allocated = +(project.allocated + value).toFixed(2);

  const tx = {
    id: nanoid(10),
    stage: 'allocation',
    amount: value,
    asset: 'USDC',
    senderId: treasury.id,
    senderLabel: treasury.label,
    receiverId: project.id,
    receiverLabel: `Project: ${project.name}`,
    projectId: project.id,
    txHash: 'mock_alloc_' + Math.random().toString(36).slice(2, 12),
    timestamp: new Date().toISOString()
  };
  db.data.transactions.push(tx);
  await db.write();
  res.status(201).json(tx);
});

export default r;
