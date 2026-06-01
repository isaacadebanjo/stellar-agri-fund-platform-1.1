import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

export const DISTRIBUTION_STATUSES = ['pending', 'paid'];

const DistributionSchema = new mongoose.Schema({
  _id: idField(10),
  investorId: { type: String, required: true, index: true },
  projectId: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  sharePercent: { type: Number, required: true, min: 0, max: 100 },
  platformFeePercent: { type: Number, default: 0, min: 0, max: 100 },
  grossProfit: { type: Number, default: 0 },
  netProfit: { type: Number, default: 0 },
  status: { type: String, enum: DISTRIBUTION_STATUSES, default: 'pending', index: true },
  // Real Stellar payout details, set when the distribution is paid.
  txHash: { type: String, default: '' },
  network: { type: String, default: '' },
  timestamp: { type: Date, default: () => new Date() },
  paidAt: { type: Date, default: null }
}, baseSchemaOptions(10, ret => {
  if (ret.timestamp instanceof Date) ret.timestamp = ret.timestamp.toISOString();
  if (ret.paidAt instanceof Date) ret.paidAt = ret.paidAt.toISOString();
}));

export default mongoose.model('Distribution', DistributionSchema);
