import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { createWallet } from '../services/stellar.js';

const r = Router();

r.get('/', (req, res) => {
  const investors = db.data.investors.map(inv => {
    const wallet = db.data.wallets.find(w => w.id === inv.walletId);
    return { ...inv, wallet };
  });
  res.json(investors);
});

r.post('/', async (req, res) => {
  const { name, email } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });

  const { publicKey, secret } = createWallet();
  const wallet = {
    id: nanoid(8),
    label: `${name} Wallet`,
    publicKey,
    secret,
    type: 'investor',
    balance: 0,
    createdAt: new Date().toISOString()
  };
  const investor = {
    id: nanoid(8),
    name,
    email: email || '',
    walletId: wallet.id,
    createdAt: new Date().toISOString()
  };
  db.data.wallets.push(wallet);
  db.data.investors.push(investor);
  await db.write();
  res.status(201).json({ ...investor, wallet });
});

// Aggregated activity summary for a single investor.
r.get('/:id/summary', (req, res) => {
  const investor = db.data.investors.find(i => i.id === req.params.id);
  if (!investor) return res.status(404).json({ error: 'investor not found' });
  const wallet = db.data.wallets.find(w => w.id === investor.walletId);

  const investmentTxs = db.data.transactions.filter(
    t => t.stage === 'investment' && t.senderId === investor.walletId
  );
  const totalInvested = investmentTxs.reduce((s, t) => s + t.amount, 0);

  const dists = db.data.distributions.filter(d => d.investorId === investor.id);
  const totalReturns = dists.reduce((s, d) => s + d.amount, 0);
  const paidReturns = dists.filter(d => d.status === 'paid').reduce((s, d) => s + d.amount, 0);
  const pendingReturns = dists.filter(d => d.status !== 'paid').reduce((s, d) => s + d.amount, 0);

  const projectIds = Array.from(new Set(dists.map(d => d.projectId)));
  const projects = projectIds.map(pid => {
    const p = db.data.projects.find(x => x.id === pid);
    const investorShareInProject = dists
      .filter(d => d.projectId === pid)
      .reduce((s, d) => s + d.amount, 0);
    return p ? {
      id: p.id,
      name: p.name,
      cropType: p.cropType || '',
      status: p.status || 'active',
      estimatedReturn: +investorShareInProject.toFixed(2)
    } : null;
  }).filter(Boolean);

  // Current estimated value = wallet balance (uninvested) + invested capital + returns booked.
  const currentEstimatedValue = +(
    (wallet?.balance || 0) + totalInvested + totalReturns
  ).toFixed(2);

  res.json({
    investor: { id: investor.id, name: investor.name, email: investor.email },
    wallet: wallet ? { id: wallet.id, publicKey: wallet.publicKey, balance: wallet.balance } : null,
    totals: {
      invested: +totalInvested.toFixed(2),
      returns: +totalReturns.toFixed(2),
      paidReturns: +paidReturns.toFixed(2),
      pendingReturns: +pendingReturns.toFixed(2),
      currentEstimatedValue,
      projectsCount: projects.length,
      transactionsCount: investmentTxs.length
    },
    projects,
    transactions: [...investmentTxs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    distributions: [...dists]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map(d => ({
        ...d,
        projectName: db.data.projects.find(p => p.id === d.projectId)?.name || 'Unknown'
      }))
  });
});

// Top up an investor wallet (simulates the investor depositing USDC into their own wallet).
r.post('/:id/fund', async (req, res) => {
  const investor = db.data.investors.find(i => i.id === req.params.id);
  if (!investor) return res.status(404).json({ error: 'investor not found' });
  const wallet = db.data.wallets.find(w => w.id === investor.walletId);
  const amount = Number(req.body?.amount);
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount > 0 required' });
  wallet.balance = +(wallet.balance + amount).toFixed(2);
  await db.write();
  res.json({ wallet });
});

export default r;
