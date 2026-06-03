// Demo environment generator. Creates a realistic, internally-consistent demo
// dataset for investor presentations — WITHOUT any on-chain activity, so it
// seeds instantly and reliably (unlike scripts/seed-demo.js which does real
// testnet transfers). Money movements are recorded as internal book-keeping
// rows (network: 'internal', txHash: 'demo_*'); wallets use locally-generated
// keypairs that are never funded.
//
// GATED: only usable when ALLOW_DEMO_SEED=true (set on demo/staging only). Both
// seed and reset are destructive to business + ledger data and must be confirmed
// by the caller. Users (logins) and the treasury wallet are preserved.
import { Keypair } from 'stellar-sdk';
import { getTreasury } from '../config/seed.js';
import { round, pct, sub } from './money.js';
import { createNotification } from './notify.js';

import Wallet from '../models/Wallet.js';
import Investor from '../models/Investor.js';
import Farmer from '../models/Farmer.js';
import Project from '../models/Project.js';
import Transaction from '../models/Transaction.js';
import Payout from '../models/Payout.js';
import Revenue from '../models/Revenue.js';
import Buyer from '../models/Buyer.js';
import OfftakeAgreement from '../models/OfftakeAgreement.js';
import Delivery from '../models/Delivery.js';
import Invoice from '../models/Invoice.js';
import Yield from '../models/Yield.js';
import Milestone from '../models/Milestone.js';
import ApprovalRequest from '../models/ApprovalRequest.js';
import Distribution from '../models/Distribution.js';
import DistributionRun from '../models/DistributionRun.js';
import FarmVisit from '../models/FarmVisit.js';
import Notification from '../models/Notification.js';
import ActivityLog from '../models/ActivityLog.js';

export function isDemoAllowed() {
  return process.env.ALLOW_DEMO_SEED === 'true';
}

// Collections wiped on reset (business + ledger). Users and the treasury wallet
// are intentionally excluded (handled separately).
const WIPE = [
  Transaction, Payout, Revenue, Distribution, DistributionRun,
  Buyer, OfftakeAgreement, Delivery, Invoice, Yield, Milestone,
  ApprovalRequest, FarmVisit, Notification, ActivityLog, Investor, Farmer, Project
];

export async function getDemoStatus() {
  const [investors, projects, buyers, farmers, transactions] = await Promise.all([
    Investor.countDocuments(), Project.countDocuments(), Buyer.countDocuments(),
    Farmer.countDocuments(), Transaction.countDocuments()
  ]);
  return { allowed: isDemoAllowed(), counts: { investors, projects, buyers, farmers, transactions } };
}

export async function resetDemo() {
  for (const Model of WIPE) await Model.deleteMany({});
  // Remove non-treasury wallets (investor/farmer demo wallets).
  await Wallet.deleteMany({ type: { $ne: 'treasury' } });
  return { ok: true };
}

// Create a wallet row with a locally-generated (unfunded) keypair.
async function demoWallet(label, type, balance) {
  const kp = Keypair.random();
  return Wallet.create({ label, publicKey: kp.publicKey(), secret: kp.secret(), type, balance });
}

const intTx = (over) => ({ asset: 'XLM', status: 'success', network: 'internal', txHash: 'demo_' + Math.random().toString(36).slice(2, 12), ...over });

export async function seedDemo() {
  await resetDemo();

  // Treasury (reuse the real seeded one; create a demo stand-in if absent).
  let treasury = await getTreasury();
  if (!treasury) treasury = await demoWallet('Central Treasury', 'treasury', 0);

  // ---- Investors + investments (internal) ----------------------------------
  const investorSpecs = [
    ['Rhea Capital Partners', 'rhea@example.com', 8000],
    ['Solaris Impact Fund', 'solaris@example.com', 6000],
    ['Meridian Family Office', 'meridian@example.com', 5000]
  ];
  const investors = [];
  for (const [name, email, invest] of investorSpecs) {
    const wallet = await demoWallet(`${name} Wallet`, 'investor', 10000);
    const investor = await Investor.create({ name, email, walletId: wallet._id });
    await Transaction.create(intTx({
      stage: 'investment', amount: invest,
      senderId: wallet._id, senderLabel: wallet.label,
      receiverId: treasury._id, receiverLabel: treasury.label, projectId: null
    }));
    investors.push({ investor, wallet, invest });
  }
  const totalInvested = investors.reduce((s, i) => s + i.invest, 0);
  treasury.balance = round((treasury.balance || 0) + totalInvested);
  await treasury.save();

  // ---- Projects (multi-country) --------------------------------------------
  const spinach = await Project.create({ name: 'Spinach Pilot — Western Cape', cropType: 'Spinach', status: 'active', hectares: 40, governanceEnabled: true, startDate: '2026-01-15', country: 'ZA', region: 'Western Cape', currency: 'ZAR' });
  const tomato = await Project.create({ name: 'Tomato Block — Rift Valley', cropType: 'Tomato', status: 'active', hectares: 60, startDate: '2026-02-01', country: 'KE', region: 'Rift Valley', currency: 'KES' });

  // ---- Allocations (internal) ----------------------------------------------
  for (const [proj, amt] of [[spinach, 12000], [tomato, 6000]]) {
    proj.allocated = amt; await proj.save();
    await Transaction.create(intTx({
      stage: 'allocation', amount: amt,
      senderId: treasury._id, senderLabel: treasury.label,
      receiverId: proj._id, receiverLabel: `Project: ${proj.name}`, projectId: proj._id
    }));
  }

  // ---- Farmers + payouts (internal) ----------------------------------------
  const farmers = [];
  for (const name of ['Harpreet Singh', 'Anita Deshmukh']) {
    const wallet = await demoWallet(`${name} Wallet`, 'farmer', 0);
    const farmer = await Farmer.create({ name, walletId: wallet._id });
    farmers.push({ farmer, wallet });
  }
  for (const [proj, f, amt] of [[spinach, farmers[0], 5000], [tomato, farmers[1], 3000]]) {
    await Payout.create({ projectId: proj._id, projectName: proj.name, farmerId: f.farmer._id, farmerName: f.farmer.name, farmerWallet: f.wallet.publicKey, amount: amt, asset: 'XLM', status: 'success', txHash: 'demo_' + Math.random().toString(36).slice(2, 12), network: 'internal' });
    await Transaction.create(intTx({ stage: 'payout', amount: amt, senderId: treasury._id, senderLabel: treasury.label, receiverId: f.farmer._id, receiverLabel: `Farmer: ${f.farmer.name}`, projectId: proj._id }));
    proj.spent = round((proj.spent || 0) + amt); await proj.save();
  }

  // ---- Revenue --------------------------------------------------------------
  await Revenue.create({ projectId: spinach._id, amount: 9000, source: 'BigBasket offtake' });
  await Revenue.create({ projectId: tomato._id, amount: 7000, source: 'Reliance Fresh offtake' });

  // ---- Buyers + offtake + deliveries + invoices ----------------------------
  const bigbasket = await Buyer.create({ name: 'BigBasket', company: 'Supermarket Grocery Supplies', contactPerson: 'Priya Nair', email: 'priya@bigbasket.com', country: 'ZA', status: 'active', verificationStatus: 'verified' });
  const reliance = await Buyer.create({ name: 'Reliance Fresh', company: 'Reliance Retail', contactPerson: 'Arjun Mehta', email: 'arjun@reliancefresh.com', country: 'KE', status: 'active', verificationStatus: 'verified' });

  const ot1 = await OfftakeAgreement.create({ agreementNumber: 'OT-2026-01', buyerId: bigbasket._id, projectId: spinach._id, crop: 'Spinach', quantityCommitted: 6000, unit: 'kg', unitPrice: 1.6, contractValue: round(6000 * 1.6), startDate: '2026-01-20', endDate: '2026-06-30', status: 'active' });
  const ot2 = await OfftakeAgreement.create({ agreementNumber: 'OT-2026-02', buyerId: reliance._id, projectId: tomato._id, crop: 'Tomato', quantityCommitted: 5000, unit: 'kg', unitPrice: 1.5, contractValue: round(5000 * 1.5), startDate: '2026-02-05', endDate: '2026-07-31', status: 'active' });

  await Delivery.create({ harvestBatch: 'SP-B1', deliveryDate: '2026-04-10', buyerId: bigbasket._id, offtakeId: ot1._id, projectId: spinach._id, quantityDelivered: 3500, unit: 'kg', unitPrice: 1.6, invoiceAmount: round(3500 * 1.6), paymentStatus: 'paid' });
  await Delivery.create({ harvestBatch: 'TM-B1', deliveryDate: '2026-04-22', buyerId: reliance._id, offtakeId: ot2._id, projectId: tomato._id, quantityDelivered: 3000, unit: 'kg', unitPrice: 1.5, invoiceAmount: round(3000 * 1.5), paymentStatus: 'partial' });

  await Invoice.create({ number: 'INV-1001', buyerId: bigbasket._id, offtakeId: ot1._id, issuedDate: '2026-04-11', dueDate: '2026-04-25', paidDate: '2026-04-20', amountDue: 5600, amountPaid: 5600, status: 'paid' });
  await Invoice.create({ number: 'INV-1002', buyerId: reliance._id, offtakeId: ot2._id, issuedDate: '2026-04-23', dueDate: '2026-05-07', amountDue: 4500, amountPaid: 2000, status: 'partial' });
  await Invoice.create({ number: 'INV-1003', buyerId: reliance._id, offtakeId: ot2._id, issuedDate: '2026-02-01', dueDate: '2026-02-15', amountDue: 1800, amountPaid: 0, status: 'unpaid' });

  // ---- Yields (dated for a trend) ------------------------------------------
  await Yield.create({ projectId: spinach._id, cropType: 'Spinach', plantingDate: '2026-01-15', harvestDate: '2026-04-05', expectedYield: 6000, actualYield: 6200, unit: 'kg', revenueGenerated: 9000 });
  await Yield.create({ projectId: tomato._id, cropType: 'Tomato', plantingDate: '2026-02-01', harvestDate: '2026-05-01', expectedYield: 5000, actualYield: 4600, unit: 'kg', revenueGenerated: 7000 });

  // ---- Milestones (spinach governance-gated) -------------------------------
  await Milestone.create({ projectId: spinach._id, title: 'Land prepared', targetDate: '2026-01-31', completionPercent: 100, releaseAmount: 6000, approvalStatus: 'approved', decisionAt: new Date() });
  await Milestone.create({ projectId: spinach._id, title: 'Planting completed', targetDate: '2026-02-20', completionPercent: 100, releaseAmount: 6000, approvalStatus: 'approved', decisionAt: new Date() });
  await Milestone.create({ projectId: spinach._id, title: 'Irrigation installed', targetDate: '2026-03-15', completionPercent: 60, releaseAmount: 4000, approvalStatus: 'pending' });

  // ---- One pending approval -------------------------------------------------
  await ApprovalRequest.create({ key: `allocation:${tomato._id}:15000`, actionType: 'allocation', status: 'pending', amount: 15000, ref: tomato._id, summary: `Allocate 15000 XLM to project ${tomato._id}`, payload: { projectId: tomato._id, amount: 15000 }, submittedBy: 'demo' });

  // ---- Farm visits ----------------------------------------------------------
  await FarmVisit.create({ projectId: spinach._id, inspector: 'A. Field', visitDate: '2026-03-20', gpsLat: -33.92, gpsLng: 18.42, findings: 'Healthy crop, irrigation on schedule', farmHealthScore: 86, complianceScore: 90, operationalStatus: 'on_track' });
  await FarmVisit.create({ projectId: tomato._id, inspector: 'B. Otieno', visitDate: '2026-04-02', gpsLat: -0.52, gpsLng: 35.27, findings: 'Minor pest pressure; mitigation advised', farmHealthScore: 68, complianceScore: 74, operationalStatus: 'attention' });

  // ---- Distribution run for spinach (one paid internally) ------------------
  const revenueS = 9000, payoutsS = round(spinach.spent || 0);
  const grossProfit = sub(revenueS, payoutsS);
  const feePct = 10;
  const netProfit = sub(grossProfit, pct(grossProfit, feePct));
  const periodStart = new Date(Date.UTC(2026, 0, 1));
  const periodEnd = new Date(Date.UTC(2026, 3, 30));
  const run = await DistributionRun.create({ projectId: spinach._id, periodStart, periodEnd, platformFeePercent: feePct, grossProfit: round(grossProfit), netProfit, investorCount: investors.length });
  const dists = [];
  for (const inv of investors) {
    const share = round((inv.invest / totalInvested) * 100, 4);
    const amount = pct(netProfit, share);
    dists.push(await Distribution.create({ investorId: inv.investor._id, projectId: spinach._id, amount, sharePercent: share, platformFeePercent: feePct, grossProfit: round(grossProfit), netProfit, status: 'pending', runId: run._id, periodStart, periodEnd }));
  }
  const top = dists.slice().sort((a, b) => b.amount - a.amount)[0];
  if (top) { top.status = 'paid'; top.paidAt = new Date(); top.txHash = 'demo_' + Math.random().toString(36).slice(2, 12); top.network = 'internal'; await top.save(); }

  // ---- A few notifications so the bell is populated ------------------------
  await createNotification({ audience: 'admin', type: 'INVESTMENT', title: 'Investment Received', message: `${fmtX(totalInvested)} invested across ${investors.length} investors`, level: 'success' });
  await createNotification({ audience: 'admin', type: 'DISTRIBUTION_GENERATED', title: 'Distribution Generated', message: `Spinach Pilot distribution run — net ${fmtX(netProfit)}`, level: 'success' });
  await createNotification({ audience: 'admin', type: 'CONTRACT_EXPIRING', title: 'Contract Expiring', message: 'Offtake OT-2026-01 ends 2026-06-30', level: 'warning' });

  return {
    ok: true,
    story: 'Investor A/B/C invest → Treasury funded → 2 projects allocated → farmers paid → harvest & yields → buyers purchase via offtake → revenue received → profit distributed (1 paid).',
    counts: {
      investors: investors.length, projects: 2, buyers: 2, farmers: 2,
      offtake: 2, deliveries: 2, invoices: 3, milestones: 3, farmVisits: 2,
      distributions: dists.length, totalInvested
    }
  };
}

const fmtX = (n) => `${round(n).toLocaleString()} XLM`;
