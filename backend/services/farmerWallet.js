import Wallet from '../models/Wallet.js';
import { createFundedWallet, fundIfMissing } from './stellar.js';

// Ensure a farmer has a custodial, on-testnet Stellar wallet to receive payouts.
//
// Mirrors the investor model: the platform creates + Friendbot-funds the wallet
// (so the account exists on-network and can receive payments) and stores the
// encrypted seed. Idempotent — returns the existing wallet if one is already
// linked, re-funding it on testnet only if it somehow isn't on-network yet.
export async function ensureFarmerWallet(farmer) {
  if (farmer.walletId) {
    const existing = await Wallet.findById(farmer.walletId);
    if (existing) {
      try { await fundIfMissing(existing.publicKey); } catch { /* best-effort */ }
      return existing;
    }
    // Stale/legacy walletId that doesn't point at a Wallet — fall through and
    // provision a real one.
  }

  const funded = await createFundedWallet();
  const wallet = await Wallet.create({
    label: `${farmer.name} Wallet`,
    publicKey: funded.publicKey,
    secret: funded.secret,
    type: 'farmer',
    balance: funded.balance
  });
  farmer.walletId = wallet._id;
  await farmer.save();
  return wallet;
}
