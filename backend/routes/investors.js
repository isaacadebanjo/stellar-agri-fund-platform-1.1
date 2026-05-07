import { Router } from 'express';
import Investor from '../models/Investor.js';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import Distribution from '../models/Distribution.js';
import Project from '../models/Project.js';
import { createWallet } from '../services/stellar.js';
import { asyncH } from './_async.js';
import { requireRole, requireSelfOrAdmin } from '../middleware/auth.js';

const r = Router();

// List + create are admin-only.
r.get('/', requireRole('admin'), asyncH(async (req, res) => {
  const investors = await Investor.find().sort({ createdAt: 1 });
  const walletIds = investors.map(i => i.walletId);
  const wallets = await Wallet.find({ _id: { $in: walletIds } });
  const walletById = new Map(wallets.map(w => [w._id, w.toJSON()]));
  res.json(investors.map(inv => ({ ...inv.toJSON(), wallet: walletById.get(inv.walletId) || null })));
}));

r.post('/', requireRole('admin'), asyncH(async (req, res) => {
  const { name, email } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });

  const { publicKey, secret } = createWallet();
  const wallet = await Wallet.create({
    label: `${name} Wallet`,
    publicKey,
    secret,
    type: 'investor',
    balance: 0
  });
  const investor = await Investor.create({
    name,
    email: email || '',
    walletId: wallet._id
  });
  res.status(201).json({ ...investor.toJSON(), wallet: wallet.toJSON() });
}));

// Aggregated activity summary for a single investor.
// Admins can view any investor; investor users only their own.
r.get('/:id/summary', requireSelfOrAdmin(req => req.params.id), asyncH(async (req, res) => {
  const investor = await Investor.findById(req.params.id);
  if (!investor) return res.status(404).json({ error: 'investor not found' });
  const wallet = await Wallet.findById(investor.walletId);

  const investmentTxs = await Transaction.find({
    stage: 'investment',
    senderId: investor.walletId
  }).sort({ timestamp: -1 });
  const totalInvested = investmentTxs.reduce((s, t) => s + t.amount, 0);

  const dists = await Distribution.find({ investorId: investor._id }).sort({ timestamp: -1 });
  const totalReturns = dists.reduce((s, d) => s + d.amount, 0);
  const paidReturns = dists.filter(d => d.status === 'paid').reduce((s, d) => s + d.amount, 0);
  const pendingReturns = dists.filter(d => d.status !== 'paid').reduce((s, d) => s + d.amount, 0);

  const projectIds = Array.from(new Set(dists.map(d => d.projectId)));
  const projectDocs = await Project.find({ _id: { $in: projectIds } });
  const projects = projectIds.map(pid => {
    const p = projectDocs.find(x => x._id === pid);
    if (!p) return null;
    const investorShareInProject = dists
      .filter(d => d.projectId === pid)
      .reduce((s, d) => s + d.amount, 0);
    return {
      id: p._id,
      name: p.name,
      cropType: p.cropType || '',
      status: p.status || 'active',
      estimatedReturn: +investorShareInProject.toFixed(2)
    };
  }).filter(Boolean);

  const currentEstimatedValue = +(
    (wallet?.balance || 0) + totalInvested + totalReturns
  ).toFixed(2);

  res.json({
    investor: { id: investor._id, name: investor.name, email: investor.email },
    wallet: wallet ? { id: wallet._id, publicKey: wallet.publicKey, balance: wallet.balance } : null,
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
    transactions: investmentTxs.map(t => t.toJSON()),
    distributions: dists.map(d => {
      const proj = projectDocs.find(p => p._id === d.projectId);
      return { ...d.toJSON(), projectName: proj?.name || 'Unknown' };
    })
  });
}));

// Top up an investor wallet (simulates the investor depositing USDC into their own wallet).
r.post('/:id/fund', requireRole('admin'), asyncH(async (req, res) => {
  const investor = await Investor.findById(req.params.id);
  if (!investor) return res.status(404).json({ error: 'investor not found' });
  const amount = Number(req.body?.amount);
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount > 0 required' });

  const wallet = await Wallet.findByIdAndUpdate(
    investor.walletId,
    { $inc: { balance: amount } },
    { new: true }
  );
  if (wallet) wallet.balance = +wallet.balance.toFixed(2);
  await wallet?.save();
  res.json({ wallet: wallet?.toJSON() });
}));

export default r;
