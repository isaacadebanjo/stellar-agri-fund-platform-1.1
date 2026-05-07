import { Router } from 'express';
import { db } from '../db.js';

const r = Router();

function projectRevenue(projectId) {
  return db.data.revenue
    .filter(rev => rev.projectId === projectId)
    .reduce((s, rev) => s + rev.amount, 0);
}

// Per-investor rollup.
r.get('/investors', (req, res) => {
  const rows = db.data.investors.map(inv => {
    const wallet = db.data.wallets.find(w => w.id === inv.walletId);
    const invested = db.data.transactions
      .filter(t => t.stage === 'investment' && t.senderId === inv.walletId)
      .reduce((s, t) => s + t.amount, 0);
    const dists = db.data.distributions.filter(d => d.investorId === inv.id);
    const returns = dists.reduce((s, d) => s + d.amount, 0);
    return {
      investorId: inv.id,
      name: inv.name,
      email: inv.email || '',
      walletBalance: +(wallet?.balance || 0).toFixed(2),
      invested: +invested.toFixed(2),
      returns: +returns.toFixed(2),
      distributionsCount: dists.length,
      net: +(returns - 0).toFixed(2)
    };
  });
  res.json(rows);
});

// Per-project rollup.
r.get('/projects', (req, res) => {
  const rows = db.data.projects.map(p => {
    const revenue = projectRevenue(p.id);
    const profit = revenue - p.spent;
    const distributed = db.data.distributions
      .filter(d => d.projectId === p.id)
      .reduce((s, d) => s + d.amount, 0);
    return {
      projectId: p.id,
      name: p.name,
      cropType: p.cropType || '',
      status: p.status || 'active',
      startDate: p.startDate || '',
      endDate: p.endDate || '',
      allocated: +p.allocated.toFixed(2),
      paidOut: +p.spent.toFixed(2),
      revenue: +revenue.toFixed(2),
      profit: +profit.toFixed(2),
      distributed: +distributed.toFixed(2)
    };
  });
  res.json(rows);
});

// Revenue vs payouts (per-project + totals).
r.get('/revenue-vs-payout', (req, res) => {
  const perProject = db.data.projects.map(p => {
    const revenue = projectRevenue(p.id);
    return {
      projectId: p.id,
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
});

export default r;
