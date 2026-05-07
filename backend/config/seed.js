import bcrypt from 'bcryptjs';
import Wallet from '../models/Wallet.js';
import Project from '../models/Project.js';
import Investor from '../models/Investor.js';
import Farmer from '../models/Farmer.js';
import User from '../models/User.js';
import { createFundedWallet, fundIfMissing, getLiveBalance } from '../services/stellar.js';

// Idempotent: only inserts when collections are missing the expected baseline.
export async function seedIfNeeded() {
  // 1. Treasury wallet — friendbot-funded on testnet.
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

  // 2. Pilot project
  const projectCount = await Project.countDocuments();
  if (projectCount === 0) {
    await Project.create({
      name: 'Spinach Pilot',
      description: 'Pilot spinach cultivation program with smallholder farmers.',
      cropType: 'Spinach',
      status: 'active'
    });
    console.log('[seed] created Spinach Pilot project');
  }

  // 3. Demo investor (with funded wallet)
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

  // 4. Demo farmer
  const farmerCount = await Farmer.countDocuments();
  if (farmerCount === 0) {
    await Farmer.create({
      name: 'Demo Farmer',
      walletId: '',
      assignedProjects: []
    });
    console.log('[seed] created demo farmer');
  }

  // 5. Demo users (admin + investor account linked to demoInvestor)
  const adminEmail = 'admin@agri.io';
  const investorEmail = 'investor@agri.io';
  const existingAdmin = await User.findOne({ email: adminEmail });
  if (!existingAdmin) {
    await User.create({
      email: adminEmail,
      passwordHash: await bcrypt.hash('admin123', 10),
      role: 'admin'
    });
    console.log(`[seed] created admin user: ${adminEmail} / admin123`);
  }
  const existingInvestorUser = await User.findOne({ email: investorEmail });
  if (!existingInvestorUser) {
    await User.create({
      email: investorEmail,
      passwordHash: await bcrypt.hash('investor123', 10),
      role: 'investor',
      investorId: demoInvestor._id
    });
    console.log(`[seed] created investor user: ${investorEmail} / investor123`);
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
