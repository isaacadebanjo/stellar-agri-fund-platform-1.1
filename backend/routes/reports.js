import { Router } from 'express';
import Investor from '../models/Investor.js';
import Wallet from '../models/Wallet.js';
import Project from '../models/Project.js';
import Revenue from '../models/Revenue.js';
import Transaction from '../models/Transaction.js';
import Distribution from '../models/Distribution.js';
import { asyncH } from './_async.js';

const r = Router();

// Per-investor rollup.
r.get('/investors', asyncH(async (req, res) => {
  const [investors, wallets, txAgg, distAgg] = await Promise.all([
    Investor.find().lean(),
    Wallet.find().lean(),
    Transaction.aggregate([
      { $match: { stage: 'investment' } },
      { $group: { _id: '$senderId', total: { $sum: '$amount' } } }
    ]),
    Distribution.aggregate([
      { $group: { _id: '$investorId', total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ])
  ]);

  const walletById = new Map(wallets.map(w => [w._id, w]));
  const investedByWallet = new Map(txAgg.map(t => [t._id, t.total]));
  const distByInvestor = new Map(distAgg.map(d => [d._id, d]));

  const rows = investors.map(inv => {
    const wallet = walletById.get(inv.walletId);
    const invested = investedByWallet.get(inv.walletId) || 0;
    const dist = distByInvestor.get(inv._id) || { total: 0, count: 0 };
    return {
      investorId: inv._id,
      name: inv.name,
      email: inv.email || '',
      walletBalance: +(wallet?.balance || 0).toFixed(2),
      invested: +invested.toFixed(2),
      returns: +dist.total.toFixed(2),
      distributionsCount: dist.count,
      net: +(dist.total - 0).toFixed(2)
    };
  });
  res.json(rows);
}));

// Per-project rollup.
r.get('/projects', asyncH(async (req, res) => {
  const [projects, revAgg, distAgg] = await Promise.all([
    Project.find().lean(),
    Revenue.aggregate([
      { $group: { _id: '$projectId', total: { $sum: '$amount' } } }
    ]),
    Distribution.aggregate([
      { $group: { _id: '$projectId', total: { $sum: '$amount' } } }
    ])
  ]);
  const revMap = new Map(revAgg.map(r => [r._id, r.total]));
  const distMap = new Map(distAgg.map(d => [d._id, d.total]));

  const rows = projects.map(p => {
    const revenue = revMap.get(p._id) || 0;
    const profit = revenue - p.spent;
    return {
      projectId: p._id,
      name: p.name,
      cropType: p.cropType || '',
      status: p.status || 'active',
      startDate: p.startDate || '',
      endDate: p.endDate || '',
      allocated: +p.allocated.toFixed(2),
      paidOut: +p.spent.toFixed(2),
      revenue: +revenue.toFixed(2),
      profit: +profit.toFixed(2),
      distributed: +(distMap.get(p._id) || 0).toFixed(2)
    };
  });
  res.json(rows);
}));

// Revenue vs payouts (per-project + totals).
r.get('/revenue-vs-payout', asyncH(async (req, res) => {
  const [projects, revAgg] = await Promise.all([
    Project.find().lean(),
    Revenue.aggregate([
      { $group: { _id: '$projectId', total: { $sum: '$amount' } } }
    ])
  ]);
  const revMap = new Map(revAgg.map(r => [r._id, r.total]));

  const perProject = projects.map(p => {
    const revenue = revMap.get(p._id) || 0;
    return {
      projectId: p._id,
      name: p.name,
      revenue: +revenue.toFixed(2),
      payouts: +p.spent.toFixed(2),
      net: +(revenue - p.spent).toFixed(2)
    };
  });
  const totals = perProject.reduce((acc, row) => ({
    revenue: acc.revenue + row.revenue,
    payouts: acc.payouts + row.payouts,
    net: acc.net + row.net
  }), { revenue: 0, payouts: 0, net: 0 });

  res.json({
    perProject,
    totals: {
      revenue: +totals.revenue.toFixed(2),
      payouts: +totals.payouts.toFixed(2),
      net: +totals.net.toFixed(2)
    }
  });
}));

export default r;
