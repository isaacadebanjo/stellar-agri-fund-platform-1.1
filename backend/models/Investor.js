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
  // Self-custodied Stellar public key (G...). Unique ONLY among real wallet keys
  // (partial index on string values) so two non-custodial investors can't claim
  // the same wallet — while any number of custodial rows (null) coexist. (A plain
  // sparse+unique index would NOT work here: `default: null` makes the field
  // present, so sparse wouldn't exclude it and two nulls would collide.)
  stellarPublicKey: {
    type: String,
    default: null,
    index: { unique: true, partialFilterExpression: { stellarPublicKey: { $type: 'string' } } }
  }
}, baseSchemaOptions());

export default mongoose.model('Investor', InvestorSchema);
