// Treasury forecasting. Builds a forward liquidity projection from the
// platform's contracted and pending obligations — open invoices and remaining
// offtake value (inflows), pending distributions, pending payouts and approved
// but unallocated milestone budgets (outflows). Read-only; reuses the same
// treasury overview the dashboards display so the starting point reconciles.
import Invoice from '../models/Invoice.js';
import OfftakeAgreement from '../models/OfftakeAgreement.js';
import Delivery from '../models/Delivery.js';
import Transaction from '../models/Transaction.js';
import Distribution from '../models/Distribution.js';
import Milestone from '../models/Milestone.js';
import Project from '../models/Project.js';
import Revenue from '../models/Revenue.js';
import { getTreasuryOverview } from './treasuryAnalytics.js';
import { round, sum } from './money.js';

const DAY = 86400000;
const HORIZONS = [30, 90, 365];

// Clamp a scheduled date into the future: past-due items are assumed to settle a
// few days out rather than retroactively, so the projection always moves forward.
function scheduleDate(dateStr, fallbackDays, now) {
  const base = dateStr ? new Date(dateStr) : new Date(now.getTime() + fallbackDays * DAY);
  if (Number.isNaN(base.getTime())) return new Date(now.getTime() + fallbackDays * DAY);
  return base < now ? new Date(now.getTime() + 5 * DAY) : base;
}

export async function getForecast() {
  const now = new Date();
  const [overview, invoices, offtakes, deliveries, pendingPayouts, pendingDistributions, milestones, projects, recentRevenue] =
    await Promise.all([
      getTreasuryOverview(),
      Invoice.find({ status: { $ne: 'paid' } }).lean(),
      OfftakeAgreement.find({ status: 'active' }).lean(),
      Delivery.find().lean(),
      Transaction.find({ stage: 'payout', status: 'pending' }).lean(),
      Distribution.find({ status: 'pending' }).lean(),
      Milestone.find({ approvalStatus: 'approved' }).lean(),
      Project.find().lean(),
      Revenue.find({ timestamp: { $gte: new Date(now.getTime() - 90 * DAY) } }).lean()
    ]);

  const events = [];

  // --- Inflows ---
  // Open invoices: the receivable still outstanding, scheduled at its due date.
  for (const inv of invoices) {
    const amount = round(Math.max(0, (inv.amountDue || 0) - (inv.amountPaid || 0)));
    if (amount <= 0) continue;
    events.push({
      date: scheduleDate(inv.dueDate, 30, now),
      type: 'inflow', amount,
      category: 'Invoice collection',
      label: `Invoice ${inv.number || inv._id}`
    });
  }
  // Remaining offtake value: contracted minus what has already been delivered,
  // scheduled at the agreement end date.
  const deliveredByOfftake = new Map();
  for (const d of deliveries) {
    if (!d.offtakeId) continue;
    deliveredByOfftake.set(d.offtakeId, (deliveredByOfftake.get(d.offtakeId) || 0) + (d.invoiceAmount || 0));
  }
  for (const o of offtakes) {
    const remaining = round(Math.max(0, (o.contractValue || 0) - (deliveredByOfftake.get(o._id) || 0)));
    if (remaining <= 0) continue;
    events.push({
      date: scheduleDate(o.endDate, 90, now),
      type: 'inflow', amount: remaining,
      category: 'Offtake settlement',
      label: `Offtake ${o.agreementNumber || o._id}`
    });
  }

  // --- Outflows ---
  for (const d of pendingDistributions) {
    if (!(d.amount > 0)) continue;
    events.push({
      date: new Date(now.getTime() + 7 * DAY),
      type: 'outflow', amount: round(d.amount),
      category: 'Investor distribution',
      label: `Distribution to investor ${d.investorId}`
    });
  }
  for (const p of pendingPayouts) {
    if (!(p.amount > 0)) continue;
    events.push({
      date: new Date(now.getTime() + 14 * DAY),
      type: 'outflow', amount: round(p.amount),
      category: 'Farmer payout',
      label: `Payout to ${p.receiverLabel || p.receiverId}`
    });
  }
  // Approved milestone budget not yet drawn down (governance-enabled projects).
  const allocatedByProject = new Map(projects.map(p => [p._id, p.allocated || 0]));
  const releaseByProject = new Map();
  for (const m of milestones) {
    releaseByProject.set(m.projectId, (releaseByProject.get(m.projectId) || 0) + (m.releaseAmount || 0));
  }
  for (const [projectId, release] of releaseByProject) {
    const project = projects.find(p => p._id === projectId);
    if (!project?.governanceEnabled) continue;
    const undrawn = round(Math.max(0, release - (allocatedByProject.get(projectId) || 0)));
    if (undrawn <= 0) continue;
    events.push({
      date: new Date(now.getTime() + 45 * DAY),
      type: 'outflow', amount: undrawn,
      category: 'Milestone release',
      label: `Milestone budget — ${project.name}`
    });
  }

  events.sort((a, b) => a.date - b.date);

  const startingBalance = overview.treasuryBalance;
  const horizons = {};
  for (const days of HORIZONS) {
    const end = new Date(now.getTime() + days * DAY);
    const inHorizon = events.filter(e => e.date <= end);
    const expectedInflows = round(sum(inHorizon.filter(e => e.type === 'inflow'), e => e.amount));
    const expectedOutflows = round(sum(inHorizon.filter(e => e.type === 'outflow'), e => e.amount));
    const netChange = round(expectedInflows - expectedOutflows);
    const endingBalance = round(startingBalance + netChange);

    // Cumulative series for charting: a point at "now" then after each event.
    let bal = startingBalance;
    const series = [{ date: now.toISOString().slice(0, 10), balance: round(bal), inflow: 0, outflow: 0 }];
    for (const e of inHorizon) {
      bal += e.type === 'inflow' ? e.amount : -e.amount;
      series.push({
        date: e.date.toISOString().slice(0, 10),
        balance: round(bal),
        inflow: e.type === 'inflow' ? e.amount : 0,
        outflow: e.type === 'outflow' ? e.amount : 0
      });
    }

    horizons[String(days)] = {
      days,
      expectedInflows,
      expectedOutflows,
      netChange,
      endingBalance,
      lowestProjectedBalance: round(Math.min(...series.map(s => s.balance))),
      series
    };
  }

  // Run-rate context: average monthly revenue over the last 90 days.
  const monthlyRevenueRunRate = round(sum(recentRevenue, r => r.amount) / 3);

  return {
    generatedAt: now.toISOString(),
    current: {
      treasuryBalance: overview.treasuryBalance,
      availableLiquidity: overview.availableLiquidity,
      treasuryHealth: overview.liquidityHealth
    },
    monthlyRevenueRunRate,
    horizons,
    // The most material scheduled movements, for an "upcoming cash events" table.
    schedule: events.slice(0, 25).map(e => ({
      date: e.date.toISOString().slice(0, 10),
      type: e.type,
      amount: e.amount,
      category: e.category,
      label: e.label
    })),
    assumptions: [
      'Inflows = outstanding invoice balances (at due date) + undelivered offtake value (at agreement end).',
      'Outflows = pending distributions, pending farmer payouts, and approved-but-undrawn milestone budgets.',
      'Past-due items are assumed to settle ~5 days out; the projection never moves backward.',
      'This is a contractual projection, not a guarantee — uncontracted future revenue is excluded.'
    ]
  };
}
