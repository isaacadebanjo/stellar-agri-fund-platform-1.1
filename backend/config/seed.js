import bcrypt from 'bcryptjs';
import Wallet from '../models/Wallet.js';
import Project from '../models/Project.js';
import Investor from '../models/Investor.js';
import Farmer from '../models/Farmer.js';
import User from '../models/User.js';
import { createFundedWallet, fundIfMissing, getLiveBalance } from '../services/stellar.js';

// Idempotent: only inserts when collections are missing the expected baseline.
//
// Always seeds core infrastructure (treasury wallet, admin user). Demo
// data (pilot project, demo investor/farmer, demo investor login) is only
// seeded when SEED_DEMO_USERS=true — never in a default production deploy.
export async function seedIfNeeded() {
  // 1. Treasury wallet — friendbot-funded on testnet. Core infra, always.
  let treasury = await Wallet.findOne({ type: 'treasury' });
  if (!treasury) {
    const w = await createFundedWallet();
    treasury = await Wallet.create({
      label: 'Central Treasury',
      publicKey: w.publicKey,
      secret: w.secret,
      type: 'treasury',
      balance: w.balance
    });
    console.log(`[seed] created treasury wallet (${treasury.publicKey}, balance ${w.balance} XLM)`);
  } else {
    // Existing treasury from a pre-Stellar build — make sure it's on testnet.
    await reconcileWallet(treasury, 'treasury');
  }

  // 2. Admin user — always. Credentials come from env; a default password is
  //    only allowed (and never printed) outside production.
  await ensureAdminUser();

  // 3. Demo data — opt-in only.
  if (process.env.SEED_DEMO_USERS !== 'true') {
    console.log('[seed] SEED_DEMO_USERS not set — skipping demo project/investor/farmer/user');
    return;
  }
  await seedDemoData();
}

async function ensureAdminUser() {
  const email = (process.env.ADMIN_EMAIL || 'admin@agri.io').toLowerCase().trim();
  if (await User.findOne({ email })) return;

  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'ADMIN_PASSWORD must be set in production to seed the admin user (refusing to create a default-credential admin).'
      );
    }
    password = 'admin123'; // dev-only convenience; not used in production
    console.warn(
      `[seed] ADMIN_PASSWORD not set — using an insecure dev default for ${email}. Set ADMIN_PASSWORD to override.`
    );
  }
  await User.create({
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: 'admin'
  });
  console.log(`[seed] created admin user: ${email}`);
}

async function seedDemoData() {
  // Pilot project
  if ((await Project.countDocuments()) === 0) {
    await Project.create({
      name: 'Spinach Pilot',
      description: 'Pilot spinach cultivation program with smallholder farmers.',
      cropType: 'Spinach',
      status: 'active'
    });
    console.log('[seed] created Spinach Pilot project');
  }

  // Demo investor (with funded wallet)
  let demoInvestor = await Investor.findOne({ email: 'demo@example.com' });
  if (!demoInvestor) {
    const w = await createFundedWallet();
    const wallet = await Wallet.create({
      label: 'Demo Investor Wallet',
      publicKey: w.publicKey,
      secret: w.secret,
      type: 'investor',
      balance: w.balance
    });
    demoInvestor = await Investor.create({
      name: 'Demo Investor',
      email: 'demo@example.com',
      walletId: wallet._id
    });
    console.log(`[seed] created demo investor + funded wallet (${wallet.publicKey})`);
  } else {
    const wallet = await Wallet.findById(demoInvestor.walletId);
    if (wallet) await reconcileWallet(wallet, 'demo investor');
  }

  // Demo farmer
  if ((await Farmer.countDocuments()) === 0) {
    await Farmer.create({ name: 'Demo Farmer', walletId: '', assignedProjects: [] });
    console.log('[seed] created demo farmer');
  }

  // Demo investor login, linked to the demo investor
  const investorEmail = (process.env.DEMO_INVESTOR_EMAIL || 'investor@agri.io').toLowerCase().trim();
  if (!(await User.findOne({ email: investorEmail }))) {
    const password = process.env.DEMO_INVESTOR_PASSWORD || 'investor123';
    await User.create({
      email: investorEmail,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'investor',
      investorId: demoInvestor._id
    });
    console.log(`[seed] created demo investor user: ${investorEmail}`);
  }
}

// If a wallet already exists in our DB but its public key isn't on testnet
// (e.g. it was created back when transfers were mocked), friendbot it now
// and refresh the stored balance from Horizon.
async function reconcileWallet(wallet, label) {
  try {
    const result = await fundIfMissing(wallet.publicKey);
    if (result.funded) {
      console.log(`[seed] friendbot-funded existing ${label} wallet on testnet`);
    }
    const live = await getLiveBalance(wallet.publicKey);
    if (live !== wallet.balance) {
      wallet.balance = live;
      await wallet.save();
    }
  } catch (e) {
    console.warn(`[seed] could not reconcile ${label} wallet: ${e.message}`);
  }
}

export async function getTreasury() {
  return Wallet.findOne({ type: 'treasury' });
}
