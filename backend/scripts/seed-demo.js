// One-command DEMO seed for the investor video. Creates a believable, internally
// consistent scenario. Headline money moves (investments, farmer payouts, one
// distribution payout) are REAL Stellar testnet transactions so they verify on
// Stellar Expert; business data (buyers, offtake, deliveries, invoices, yields,
// milestones, governance) is written directly.
//
//   cd backend
//   # set MONGODB_URI, WALLET_ENC_KEY, JWT_SECRET (and STELLAR_* defaults are fine)
//   node scripts/seed-demo.js          # prints the plan
//   node scripts/seed-demo.js --yes    # actually seed (does real testnet transfers; ~1–2 min)
//
// Additive — intended to run once on a freshly-wiped DB. Every on-chain step is
// best-effort (logged + skipped on failure) so a flaky faucet can't abort the seed.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { getTreasury } from '../config/seed.js';
import { createFundedWallet, transferXLM, getLiveBalance, ASSET, NETWORK } from '../services/stellar.js';
import { round, pct, sub } from '../services/money.js';
import Project from '../models/Project.js';
import Investor from '../models/Investor.js';
import Farmer from '../models/Farmer.js';
import Wallet from '../models/Wallet.js';
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

const log = (...a) => console.log('[seed-demo]', ...a);

async function makeInvestor(name, email, invest) {
  const w = await createFundedWallet(); // Friendbot-funded testnet wallet (~10k XLM)
  const wallet = await Wallet.create({ label: `${name} Wallet`, publicKey: w.publicKey, secret: w.secret, type: 'investor', balance: w.balance });
  const investor = await Investor.create({ name, email, walletId: wallet._id });
  return { investor, wallet, invest };
}

async function makeFarmer(name) {
  const w = await createFundedWallet();
  const wallet = await Wallet.create({ label: `${name} Wallet`, publicKey: w.publicKey, secret: w.secret, type: 'farmer', balance: w.balance });
  const farmer = await Farmer.create({ name, walletId: wallet._id });
  return { farmer, wallet };
}

async function run() {
  if (!(process.argv.includes('--yes') || process.env.CONFIRM_SEED === 'yes')) {
    log('PLAN: 3 projects, 4 investors (real funded wallets + real investments), 4 farmers,');
    log('  real farmer payouts, revenue, 3 buyers, 3 offtake agreements, deliveries, invoices,');
    log('  yields (trend), milestones (some approved), 1 pending approval, 1 distribution run (1 paid on-chain).');
    log('Re-run with --yes to execute (does real testnet transfers; ~1–2 min).');
    process.exit(0);
  }

  await connectDB();

  // Reconcile the Investor index: drop a stale unique index on stellarPublicKey
  // (which would reject multiple custodial investors) and rebuild the corrected
  // partial index from the schema. Safe + idempotent.
  try { await Investor.collection.dropIndex('stellarPublicKey_1'); } catch { /* not present */ }
  try { await Investor.init(); } catch { /* index build best-effort */ }

  const treasury = await getTreasury();
  if (!treasury) { console.error('No treasury wallet — start the backend once so it seeds, then retry.'); process.exit(1); }

  // ---- Projects -------------------------------------------------------------
  const spinach = await Project.create({ name: 'Spinach Pilot — Punjab', cropType: 'Spinach', status: 'active', hectares: 40, governanceEnabled: true, startDate: '2026-01-15' });
  const tomato = await Project.create({ name: 'Tomato Harvest 2026 — Nashik', cropType: 'Tomato', status: 'active', hectares: 60, startDate: '2026-02-01' });
  const maize = await Project.create({ name: 'Maize Block C — MP', cropType: 'Maize', status: 'active', hectares: 25, startDate: '2026-01-20' });
  log('created 3 projects');

  // ---- Investors + real investments ----------------------------------------
  const specs = [
    ['Rhea Capital Partners', 'rhea@example.com', 8000],
    ['Solaris Impact Fund', 'solaris@example.com', 6000],
    ['Meridian Family Office', 'meridian@example.com', 5000],
    ['Daksh Singh', 'daksh@example.com', 3000]
  ];
  const investors = [];
  for (const [name, email, invest] of specs) {
    try {
      const inv = await makeInvestor(name, email, invest);
      investors.push(inv);
      log(`investor ${name} funded (${inv.wallet.publicKey.slice(0, 6)}…)`);
      // Real investment investor → treasury.
      try {
        const r = await transferXLM({ fromSecret: inv.wallet.decryptSecret(), toPublicKey: treasury.publicKey, amount: invest });
        await Transaction.create({ stage: 'investment', amount: invest, asset: ASSET, senderId: inv.wallet._id, senderLabel: inv.wallet.label, receiverId: treasury._id, receiverLabel: treasury.label, projectId: null, txHash: r.txHash, ledger: r.ledger, status: 'success', network: r.network });
        log(`  invested ${invest} XLM on-chain (${r.txHash.slice(0, 10)}…)`);
      } catch (e) { log(`  ! invest transfer failed for ${name}: ${e.message}`); }
    } catch (e) { log(`! could not create investor ${name}: ${e.message}`); }
  }
  // Refresh treasury balance from chain.
  try { treasury.balance = await getLiveBalance(treasury.publicKey); await treasury.save(); } catch { /* ignore */ }

  // ---- Allocations (internal book-keeping) ----------------------------------
  const allocations = [[spinach, 12000], [tomato, 8000], [maize, 2000]];
  for (const [proj, amt] of allocations) {
    proj.allocated = amt;
    await proj.save();
    await Transaction.create({ stage: 'allocation', amount: amt, asset: ASSET, senderId: treasury._id, senderLabel: treasury.label, receiverId: proj._id, receiverLabel: `Project: ${proj.name}`, projectId: proj._id, txHash: 'internal_alloc_' + Math.random().toString(36).slice(2, 10), status: 'success', network: 'internal' });
  }
  log('allocated capital to projects');

  // ---- Farmers + real payouts -----------------------------------------------
  const farmerSpecs = ['Harpreet Singh', 'Anita Deshmukh', 'Ramesh Patel', 'Lakshmi Rao'];
  const farmers = [];
  for (const name of farmerSpecs) {
    try { farmers.push(await makeFarmer(name)); log(`farmer ${name} wallet funded`); }
    catch (e) { log(`! could not create farmer ${name}: ${e.message}`); }
  }
  const payouts = [[spinach, farmers[0], 5000], [tomato, farmers[1], 3000]];
  for (const [proj, f, amt] of payouts) {
    if (!f) continue;
    try {
      const r = await transferXLM({ fromSecret: treasury.decryptSecret(), toPublicKey: f.wallet.publicKey, amount: amt });
      await Payout.create({ projectId: proj._id, projectName: proj.name, farmerId: f.farmer._id, farmerName: f.farmer.name, farmerWallet: f.wallet.publicKey, amount: amt, asset: ASSET, status: 'success', txHash: r.txHash, ledger: r.ledger, network: r.network });
      await Transaction.create({ stage: 'payout', amount: amt, asset: ASSET, senderId: treasury._id, senderLabel: treasury.label, receiverId: f.farmer._id, receiverLabel: `Farmer: ${f.farmer.name}`, projectId: proj._id, txHash: r.txHash, ledger: r.ledger, status: 'success', network: r.network });
      proj.spent = round((proj.spent || 0) + amt); await proj.save();
      log(`paid ${amt} XLM to ${f.farmer.name} on-chain (${r.txHash.slice(0, 10)}…)`);
    } catch (e) { log(`! payout failed: ${e.message}`); }
  }

  // ---- Revenue --------------------------------------------------------------
  await Revenue.create({ projectId: spinach._id, amount: 9000, source: 'BigBasket offtake' });
  await Revenue.create({ projectId: tomato._id, amount: 7000, source: 'Reliance Fresh offtake' });
  await Revenue.create({ projectId: maize._id, amount: 1500, source: 'Local market' });
  log('recorded revenue');

  // ---- Buyers + offtake + deliveries + invoices -----------------------------
  const bigbasket = await Buyer.create({ name: 'BigBasket', company: 'Supermarket Grocery Supplies', contactPerson: 'Priya Nair', email: 'priya@bigbasket.com', country: 'India', status: 'active', verificationStatus: 'verified' });
  const reliance = await Buyer.create({ name: 'Reliance Fresh', company: 'Reliance Retail', contactPerson: 'Arjun Mehta', email: 'arjun@reliancefresh.com', country: 'India', status: 'active', verificationStatus: 'verified' });
  const itc = await Buyer.create({ name: 'ITC Agri Business', company: 'ITC Ltd', contactPerson: 'Sana Kapoor', email: 'sana@itc.in', country: 'India', status: 'active', verificationStatus: 'pending' });
  log('created buyers');

  const offtakes = [
    ['OT-2026-01', bigbasket, spinach, 'Spinach', 6000, 1.6, '2026-01-20', '2026-06-30'],
    ['OT-2026-02', reliance, tomato, 'Tomato', 5000, 1.5, '2026-02-05', '2026-07-31'],
    ['OT-2026-03', itc, maize, 'Maize', 2000, 0.9, '2026-01-25', '2026-05-31']
  ];
  const offtakeDocs = {};
  for (const [num, buyer, proj, crop, qty, price, sd, ed] of offtakes) {
    offtakeDocs[num] = await OfftakeAgreement.create({ agreementNumber: num, buyerId: buyer._id, projectId: proj._id, crop, quantityCommitted: qty, unit: 'kg', unitPrice: price, contractValue: round(qty * price), startDate: sd, endDate: ed, status: 'active' });
  }
  log('created offtake agreements');

  await Delivery.create({ harvestBatch: 'SP-B1', deliveryDate: '2026-04-10', buyerId: bigbasket._id, offtakeId: offtakeDocs['OT-2026-01']._id, projectId: spinach._id, quantityDelivered: 3500, unit: 'kg', unitPrice: 1.6, invoiceAmount: round(3500 * 1.6), paymentStatus: 'paid' });
  await Delivery.create({ harvestBatch: 'TM-B1', deliveryDate: '2026-04-22', buyerId: reliance._id, offtakeId: offtakeDocs['OT-2026-02']._id, projectId: tomato._id, quantityDelivered: 3000, unit: 'kg', unitPrice: 1.5, invoiceAmount: round(3000 * 1.5), paymentStatus: 'partial' });
  log('created deliveries');

  await Invoice.create({ number: 'INV-1001', buyerId: bigbasket._id, projectId: spinach._id, issuedDate: '2026-04-11', dueDate: '2026-04-25', paidDate: '2026-04-20', amountDue: 5600, amountPaid: 5600, status: 'paid' });
  await Invoice.create({ number: 'INV-1002', buyerId: reliance._id, projectId: tomato._id, issuedDate: '2026-04-23', dueDate: '2026-05-07', amountDue: 4500, amountPaid: 2000, status: 'partial' });
  await Invoice.create({ number: 'INV-1003', buyerId: itc._id, projectId: maize._id, issuedDate: '2026-02-01', dueDate: '2026-02-15', amountDue: 1800, amountPaid: 0, status: 'unpaid' });
  log('created invoices (incl. one overdue)');

  // ---- Yields (dated for a trend) -------------------------------------------
  await Yield.create({ projectId: maize._id, cropType: 'Maize', plantingDate: '2026-01-20', harvestDate: '2026-03-15', expectedYield: 2000, actualYield: 2100, unit: 'kg', revenueGenerated: 1500 });
  await Yield.create({ projectId: spinach._id, cropType: 'Spinach', plantingDate: '2026-01-15', harvestDate: '2026-04-05', expectedYield: 6000, actualYield: 6200, unit: 'kg', revenueGenerated: 9000 });
  await Yield.create({ projectId: tomato._id, cropType: 'Tomato', plantingDate: '2026-02-01', harvestDate: '2026-05-01', expectedYield: 5000, actualYield: 4600, unit: 'kg', revenueGenerated: 7000 });
  log('created yield records');

  // ---- Milestones (spinach is governance-gated; approved budget = allocation) ---
  await Milestone.create({ projectId: spinach._id, title: 'Land prepared', targetDate: '2026-01-31', completionPercent: 100, releaseAmount: 6000, approvalStatus: 'approved', decisionAt: new Date() });
  await Milestone.create({ projectId: spinach._id, title: 'Planting completed', targetDate: '2026-02-20', completionPercent: 100, releaseAmount: 6000, approvalStatus: 'approved', decisionAt: new Date() });
  await Milestone.create({ projectId: spinach._id, title: 'Irrigation installed', targetDate: '2026-03-15', completionPercent: 60, releaseAmount: 4000, approvalStatus: 'pending' });
  await Milestone.create({ projectId: spinach._id, title: 'Harvest completed', targetDate: '2026-04-30', completionPercent: 80, releaseAmount: 0, approvalStatus: 'pending' });
  log('created milestones');

  // ---- One pending approval (so the Governance queue is populated) ----------
  await ApprovalRequest.create({
    key: `allocation:${tomato._id}:15000`, actionType: 'allocation', status: 'pending',
    amount: 15000, ref: tomato._id, summary: `Allocate 15000 XLM to project ${tomato._id}`,
    payload: { projectId: tomato._id, amount: 15000 }, submittedBy: 'demo'
  });
  log('created 1 pending approval');

  // ---- Distribution run for spinach (1 paid on-chain) -----------------------
  try {
    const revenueS = 9000, payoutsS = round(spinach.spent || 0);
    const grossProfit = sub(revenueS, payoutsS);
    const feePct = 10;
    const platformFee = pct(grossProfit, feePct);
    const netProfit = sub(grossProfit, platformFee);
    const totalInvested = investors.reduce((s, i) => s + i.invest, 0) || 1;
    const now = new Date();
    const periodStart = new Date(Date.UTC(2026, 0, 1));
    const periodEnd = new Date(Date.UTC(2026, 3, 30));
    const run = await DistributionRun.create({ projectId: spinach._id, periodStart, periodEnd, platformFeePercent: feePct, grossProfit: round(grossProfit), netProfit, investorCount: investors.length, timestamp: now });
    const dists = [];
    for (const inv of investors) {
      const share = round((inv.invest / totalInvested) * 100, 4);
      const amount = pct(netProfit, share);
      dists.push(await Distribution.create({ investorId: inv.investor._id, projectId: spinach._id, amount, sharePercent: share, platformFeePercent: feePct, grossProfit: round(grossProfit), netProfit, status: 'pending', runId: run._id, periodStart, periodEnd, timestamp: now }));
    }
    log(`generated distribution run (${dists.length} investors, net ${netProfit} XLM)`);
    // Pay the largest distribution on-chain so there's a real settled payout.
    const top = dists.sort((a, b) => b.amount - a.amount)[0];
    const topInv = investors.find(i => i.investor._id === top.investorId);
    if (top && topInv) {
      try {
        const r = await transferXLM({ fromSecret: treasury.decryptSecret(), toPublicKey: topInv.wallet.publicKey, amount: top.amount });
        top.status = 'paid'; top.paidAt = new Date(); top.txHash = r.txHash; top.network = r.network; await top.save();
        await Transaction.create({ stage: 'payout', amount: top.amount, asset: ASSET, senderId: treasury._id, senderLabel: treasury.label, receiverId: topInv.wallet._id, receiverLabel: topInv.wallet.label, projectId: spinach._id, txHash: r.txHash, ledger: r.ledger, status: 'success', network: r.network });
        log(`paid distribution ${top.amount} XLM to ${topInv.investor.name} on-chain (${r.txHash.slice(0, 10)}…)`);
      } catch (e) { log(`! distribution payout failed: ${e.message}`); }
    }
  } catch (e) { log(`! distribution run failed: ${e.message}`); }

  // ---- Summary --------------------------------------------------------------
  let bal = 0; try { bal = await getLiveBalance(treasury.publicKey); } catch { /* ignore */ }
  log('────────────────────────────────────────');
  log(`DONE. Treasury live balance ≈ ${round(bal)} XLM`);
  log('Investors: 4 · Projects: 3 · Farmers: 4 · Buyers: 3 · Offtake: 3');
  log('Use these on-screen numbers when narrating. Log in as daksh@agri.io.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => { console.error('[seed-demo] failed:', err); process.exit(1); });
