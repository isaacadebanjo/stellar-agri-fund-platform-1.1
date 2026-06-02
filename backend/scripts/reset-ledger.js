// On-demand: wipe the money trail (ledger/history) for a clean slate, KEEPING
// investors, farmers, projects, users and their funded wallets.
//
//   cd backend
//   # set MONGODB_URI (and WALLET_ENC_KEY/JWT_SECRET so model imports load)
//   node scripts/reset-ledger.js          # DRY RUN — only prints what it would delete
//   node scripts/reset-ledger.js --yes    # actually delete
//
// Deletes: Transactions, Payouts, Distributions, DistributionRuns, Revenue,
// ActivityLog, IdempotencyKeys. Resets every project's allocated/spent to 0.
// Does NOT touch Investors, Farmers, Projects (other than zeroing balances),
// Users, or Wallets. IRREVERSIBLE — there is no undo.
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

const COLLECTIONS = [
  ['Transactions', Transaction],
  ['Payouts', Payout],
  ['Distributions', Distribution],
  ['DistributionRuns', DistributionRun],
  ['Revenue', Revenue],
  ['ActivityLog', ActivityLog],
  ['IdempotencyKeys', IdempotencyKey]
];

async function run() {
  const confirmed = process.argv.includes('--yes') || process.env.CONFIRM_RESET === 'yes';

  await connectDB();

  // Always report current counts first.
  console.log('[reset-ledger] current money-trail records:');
  const counts = [];
  for (const [label, Model] of COLLECTIONS) {
    const n = await Model.countDocuments();
    counts.push([label, n]);
    console.log(`  - ${label}: ${n}`);
  }
  const projectsWithBalances = await Project.countDocuments({
    $or: [{ allocated: { $gt: 0 } }, { spent: { $gt: 0 } }]
  });
  console.log(`  - Projects with non-zero allocated/spent (will be zeroed): ${projectsWithBalances}`);

  if (!confirmed) {
    console.log('\n[reset-ledger] DRY RUN — nothing deleted.');
    console.log('[reset-ledger] Re-run with --yes (or CONFIRM_RESET=yes) to actually wipe.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log('\n[reset-ledger] --yes given — deleting…');
  for (const [label, Model] of COLLECTIONS) {
    const { deletedCount } = await Model.deleteMany({});
    console.log(`  - cleared ${label}: ${deletedCount}`);
  }
  const { modifiedCount } = await Project.updateMany({}, { $set: { allocated: 0, spent: 0 } });
  console.log(`  - reset allocated/spent to 0 on ${modifiedCount} project(s)`);

  console.log('\n[reset-ledger] done. Investors, farmers, projects, users and wallets were kept.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('[reset-ledger] failed:', err);
  process.exit(1);
});
