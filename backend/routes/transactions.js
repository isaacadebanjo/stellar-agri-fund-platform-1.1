import { Router } from 'express';
import Transaction from '../models/Transaction.js';
import Investor from '../models/Investor.js';
import Wallet from '../models/Wallet.js';
import Project from '../models/Project.js';
import { simulateTransfer } from '../services/stellar.js';
import { getTreasury } from '../config/seed.js';
import { asyncH } from './_async.js';

const r = Router();

r.get('/', asyncH(async (req, res) => {
  const txs = await Transaction.find().sort({ timestamp: -1 });
  res.json(txs.map(t => t.toJSON()));
}));

// Investor → Treasury
r.post('/invest', asyncH(async (req, res) => {
  const { investorId, amount } = req.body || {};
  const value = Number(amount);
  if (!value || value <= 0) return res.status(400).json({ error: 'amount > 0 required' });

  const investor = await Investor.findById(investorId);
  if (!investor) return res.status(404).json({ error: 'investor not found' });

  const investorWallet = await Wallet.findById(investor.walletId);
  const treasury = await getTreasury();
  if (!investorWallet || !treasury) return res.status(500).json({ error: 'wallets not initialised' });

  try {
    const meta = simulateTransfer({ from: investorWallet, to: treasury, amount: value });
    await investorWallet.save();
    await treasury.save();
    const tx = await Transaction.create({
      stage: 'investment',
      amount: value,
      asset: 'USDC',
      senderId: investorWallet._id,
      senderLabel: investorWallet.label,
      receiverId: treasury._id,
      receiverLabel: treasury.label,
      projectId: null,
      txHash: meta.txHash
    });
    res.status(201).json(tx.toJSON());
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

// Treasury → Project allocation (no real wallet — project balance is tracked on the project record)
r.post('/allocate', asyncH(async (req, res) => {
  const { projectId, amount } = req.body || {};
  const value = Number(amount);
  if (!value || value <= 0) return res.status(400).json({ error: 'amount > 0 required' });

  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const treasury = await getTreasury();
  if (!treasury) return res.status(500).json({ error: 'treasury not initialised' });
  if (treasury.balance < value) return res.status(400).json({ error: 'Treasury has insufficient funds' });

  treasury.balance = +(treasury.balance - value).toFixed(2);
  project.allocated = +(project.allocated + value).toFixed(2);
  await treasury.save();
  await project.save();

  const tx = await Transaction.create({
    stage: 'allocation',
    amount: value,
    asset: 'USDC',
    senderId: treasury._id,
    senderLabel: treasury.label,
    receiverId: project._id,
    receiverLabel: `Project: ${project.name}`,
    projectId: project._id,
    txHash: 'mock_alloc_' + Math.random().toString(36).slice(2, 12)
  });
  res.status(201).json(tx.toJSON());
}));

export default r;
