import { Router } from 'express';
import { db, getTreasury } from '../db.js';

const r = Router();

r.get('/', (req, res) => {
  const txs = db.data.transactions;
  const totalReceived = txs
    .filter(t => t.stage === 'investment')
    .reduce((s, t) => s + t.amount, 0);
  const totalAllocated = txs
    .filter(t => t.stage === 'allocation')
    .reduce((s, t) => s + t.amount, 0);
  const totalPaidOut = db.data.payouts.reduce((s, p) => s + p.amount, 0);
  const totalRevenue = db.data.revenue.reduce((s, r) => s + r.amount, 0);
  const estimatedProfit = totalRevenue - totalPaidOut;
  const treasury = getTreasury();

  // Per-project breakdown (revenue / payouts / profit) for charts.
  const projectBreakdown = db.data.projects.map(p => {
    const revenue = db.data.revenue
      .filter(r => r.projectId === p.id)
      .reduce((s, r) => s + r.amount, 0);
    return {
      projectId: p.id,
      name: p.name,
      cropType: p.cropType || '',
      status: p.status || 'active',
      allocated: +p.allocated.toFixed(2),
      payouts: +p.spent.toFixed(2),
      revenue: +revenue.toFixed(2),
      profit: +(revenue - p.spent).toFixed(2)
    };
  });

  // Profit trend bucketed by day (across all projects). Combines revenue (+) and payouts (-).
  const dayMap = {};
  const bump = (ts, key, delta) => {
    const day = ts.slice(0, 10);
    if (!dayMap[day]) dayMap[day] = { date: day, revenue: 0, payouts: 0 };
    dayMap[day][key] = +(dayMap[day][key] + delta).toFixed(2);
  };
  for (const r of db.data.revenue) bump(r.timestamp, 'revenue', r.amount);
  for (const p of db.data.payouts) bump(p.timestamp, 'payouts', p.amount);
  const profitTrend = Object.values(dayMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .reduce((acc, d) => {
      const prev = acc[acc.length - 1]?.cumulativeProfit || 0;
      const dailyProfit = +(d.revenue - d.payouts).toFixed(2);
      acc.push({
        ...d,
        dailyProfit,
        cumulativeProfit: +(prev + dailyProfit).toFixed(2)
      });
      return acc;
    }, []);

  res.json({
    treasury: {
      id: treasury.id,
      publicKey: treasury.publicKey,
      balance: treasury.balance
    },
    totals: {
      received: +totalReceived.toFixed(2),
      allocated: +totalAllocated.toFixed(2),
      paidOut: +totalPaidOut.toFixed(2),
      treasuryBalance: treasury.balance,
      revenue: +totalRevenue.toFixed(2),
      estimatedProfit: +estimatedProfit.toFixed(2)
    },
    counts: {
      investors: db.data.investors.length,
      projects: db.data.projects.length,
      transactions: txs.length,
      payouts: db.data.payouts.length,
      farmers: db.data.farmers.length,
      revenueEntries: db.data.revenue.length,
      distributions: db.data.distributions.length
    },
    projectBreakdown,
    profitTrend
  });
});

export default r;
