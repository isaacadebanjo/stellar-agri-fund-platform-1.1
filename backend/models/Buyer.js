import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

export const BUYER_STATUSES = ['active', 'inactive'];
export const VERIFICATION_STATUSES = ['unverified', 'pending', 'verified'];

// A commercial buyer/offtaker of project produce. Off-chain business record —
// part of the Institutional Readiness module, independent of the Stellar flow.
const BuyerSchema = new mongoose.Schema({
  _id: idField(),
  name: { type: String, required: true, trim: true },
  company: { type: String, default: '' },
  contactPerson: { type: String, default: '' },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  country: { type: String, default: '' },
  status: { type: String, enum: BUYER_STATUSES, default: 'active', index: true },
  verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: 'unverified', index: true },
  notes: { type: String, default: '' },
  archived: { type: Boolean, default: false, index: true }
}, baseSchemaOptions());

export default mongoose.model('Buyer', BuyerSchema);
