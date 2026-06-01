import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

export const ROLES = ['admin', 'investor'];

const UserSchema = new mongoose.Schema({
  _id: idField(8),
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ROLES, required: true, index: true },
  // Only set for role: 'investor' — links the user to their Investor doc
  // so investor accounts can only view their own data.
  investorId: { type: String, default: null, index: true },
  // 'password' (email/password login) or 'wallet' (SEP-10 non-custodial).
  authType: { type: String, enum: ['password', 'wallet'], default: 'password' },
  // For wallet users: the verified Stellar public key (G...) they logged in
  // with. Lets the frontend show the connected key and reconnect on reload.
  walletPublicKey: { type: String, default: null, index: { unique: true, sparse: true } }
}, baseSchemaOptions(8, ret => {
  // Never leak the password hash in API responses.
  delete ret.passwordHash;
}));

export default mongoose.model('User', UserSchema);
