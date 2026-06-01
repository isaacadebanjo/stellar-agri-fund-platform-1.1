// One-time migration: encrypt any wallet seeds still stored as plaintext.
//
//   cd backend && node scripts/encrypt-wallets.js
//
// Safe to run repeatedly — already-encrypted rows are skipped. Requires
// MONGODB_URI and WALLET_ENC_KEY to be set (same as the server).
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Wallet from '../models/Wallet.js';
import { isEncrypted } from '../services/crypto.js';

async function run() {
  await connectDB();
  const wallets = await Wallet.find();
  let migrated = 0;

  for (const w of wallets) {
    if (isEncrypted(w.secret)) continue;
    // Re-setting through the schema setter encrypts the plaintext value.
    w.set('secret', w.secret);
    await w.save();
    migrated += 1;
    console.log(`[migrate] encrypted wallet ${w._id} (${w.type})`);
  }

  console.log(
    `[migrate] done — ${migrated} encrypted, ${wallets.length - migrated} already encrypted`
  );
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
