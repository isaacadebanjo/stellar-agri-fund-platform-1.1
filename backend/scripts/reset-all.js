// On-demand FULL DATA WIPE — clean slate, KEEPING only the admin login and the
// treasury (master) wallet so the app still works after.
//
//   cd backend
//   # set MONGODB_URI (and WALLET_ENC_KEY/JWT_SECRET so model imports load)
//   node scripts/reset-all.js          # DRY RUN — only prints what it would delete
//   node scripts/reset-all.js --yes    # actually delete
//
// Deletes: projects, farmers, investors, investor/farmer wallets, buyers,
// offtake, deliveries, invoices, yields, milestones, approval requests, and the
// whole money trail (transactions, payouts, distributions, distribution runs,
// revenue, activity log, idempotency keys) + all non-admin users.
// KEEPS: the seeded admin user(s) and the treasury wallet. IRREVERSIBLE.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Transaction from '../models/Transaction.js';
import Payout from '../models/Payout.js';
import Distribution from '../models/Distribution.js';
import DistributionRun from '../models/DistributionRun.js';
import Revenue from '../models/Revenue.js';
import ActivityLog from '../models/ActivityLog.js';
import IdempotencyKey from '../models/IdempotencyKey.js';
import Project from '../models/Project.js';
import Farmer from '../models/Farmer.js';
import Investor from '../models/Investor.js';
import Buyer from '../models/Buyer.js';
import OfftakeAgreement from '../models/OfftakeAgreement.js';
import Delivery from '../models/Delivery.js';
import Invoice from '../models/Invoice.js';
import Yield from '../models/Yield.js';
import Milestone from '../models/Milestone.js';
import ApprovalRequest from '../models/ApprovalRequest.js';
import Wallet from '../models/Wallet.js';
import User from '../models/User.js';

// Collections wiped entirely.
const FULL_CLEAR = [
  ['Transactions', Transaction],
  ['Payouts', Payout],
  ['Distributions', Distribution],
  ['DistributionRuns', DistributionRun],
  ['Revenue', Revenue],
  ['ActivityLog', ActivityLog],
  ['IdempotencyKeys', IdempotencyKey],
  ['Projects', Project],
  ['Farmers', Farmer],
  ['Investors', Investor],
  ['Buyers', Buyer],
  ['OfftakeAgreements', OfftakeAgreement],
  ['Deliveries', Delivery],
  ['Invoices', Invoice],
  ['Yields', Yield],
  ['Milestones', Milestone],
  ['ApprovalRequests', ApprovalRequest]
];

async function run() {
  const confirmed = process.argv.includes('--yes') || process.env.CONFIRM_RESET === 'yes';
  // The single admin login to KEEP — every other user (incl. other admins) is deleted.
  const KEEP_ADMIN = (process.env.KEEP_ADMIN_EMAIL || 'daksh@agri.io').toLowerCase().trim();
  await connectDB();

  console.log('[reset-all] records that WILL be deleted:');
  for (const [label, Model] of FULL_CLEAR) {
    console.log(`  - ${label}: ${await Model.countDocuments()}`);
  }
  const investorFarmerWallets = await Wallet.countDocuments({ type: { $ne: 'treasury' } });
  const usersToDelete = await User.countDocuments({ email: { $ne: KEEP_ADMIN } });
  console.log(`  - Wallets (investor/farmer, treasury kept): ${investorFarmerWallets}`);
  console.log(`  - Users (everyone except ${KEEP_ADMIN}): ${usersToDelete}`);

  console.log('[reset-all] records that will be KEPT:');
  console.log(`  - Treasury wallet(s): ${await Wallet.countDocuments({ type: 'treasury' })}`);
  console.log(`  - Admin login kept: ${KEEP_ADMIN} (${await User.countDocuments({ email: KEEP_ADMIN })} match)`);

  if (!confirmed) {
    console.log('\n[reset-all] DRY RUN — nothing deleted.');
    console.log('[reset-all] Re-run with --yes (or CONFIRM_RESET=yes) to actually wipe.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log('\n[reset-all] --yes given — deleting…');
  for (const [label, Model] of FULL_CLEAR) {
    const { deletedCount } = await Model.deleteMany({});
    console.log(`  - cleared ${label}: ${deletedCount}`);
  }
  const w = await Wallet.deleteMany({ type: { $ne: 'treasury' } });
  console.log(`  - deleted ${w.deletedCount} investor/farmer wallet(s) (treasury kept)`);
  const u = await User.deleteMany({ email: { $ne: KEEP_ADMIN } });
  console.log(`  - deleted ${u.deletedCount} user(s); kept ${KEEP_ADMIN}`);

  console.log('\n[reset-all] done. Only the treasury wallet and admin login were kept.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('[reset-all] failed:', err);
  process.exit(1);
});
