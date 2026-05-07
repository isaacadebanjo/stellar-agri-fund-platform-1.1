import { Keypair } from 'stellar-sdk';
import Wallet from '../models/Wallet.js';
import Project from '../models/Project.js';
import Investor from '../models/Investor.js';
import Farmer from '../models/Farmer.js';

// Idempotent: only inserts when collections are missing the expected baseline.
export async function seedIfNeeded() {
  // 1. Treasury wallet
  let treasury = await Wallet.findOne({ type: 'treasury' });
  if (!treasury) {
    const kp = Keypair.random();
    treasury = await Wallet.create({
      label: 'Central Treasury',
      publicKey: kp.publicKey(),
      secret: kp.secret(),
      type: 'treasury',
      balance: 0
    });
    console.log('[seed] created treasury wallet');
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

  // 3. Demo investor (with wallet)
  const investorCount = await Investor.countDocuments();
  if (investorCount === 0) {
    const kp = Keypair.random();
    const wallet = await Wallet.create({
      label: 'Demo Investor Wallet',
      publicKey: kp.publicKey(),
      secret: kp.secret(),
      type: 'investor',
      balance: 0
    });
    await Investor.create({
      name: 'Demo Investor',
      email: 'demo@example.com',
      walletId: wallet._id
    });
    console.log('[seed] created demo investor + wallet');
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
}

export async function getTreasury() {
  return Wallet.findOne({ type: 'treasury' });
}
