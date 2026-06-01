import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

const InvestorSchema = new mongoose.Schema({
  _id: idField(8),
  name: { type: String, required: true, trim: true },
  email: { type: String, default: '', trim: true },
  // Custodial investors get a server-managed Wallet (walletId set, the app
  // holds the seed). Non-custodial investors connect their own Stellar wallet
  // (Freighter/Albedo) and authenticate via SEP-10 — the app never sees their
  // seed, so walletId is absent and stellarPublicKey holds their G... address.
  custodial: { type: Boolean, default: true },
  walletId: { type: String, default: null, index: true },
  // Self-custodied Stellar public key (G...). Sparse-unique so two investors
  // can't claim the same wallet, while custodial rows (null) are unaffected.
  stellarPublicKey: { type: String, default: null, index: { unique: true, sparse: true } }
}, baseSchemaOptions());

export default mongoose.model('Investor', InvestorSchema);
