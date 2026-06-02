import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

const PayoutSchema = new mongoose.Schema({
  _id: idField(10),
  projectId: { type: String, required: true, index: true },
  projectName: { type: String, default: '' },
  farmerId: { type: String, required: true, index: true },
  farmerName: { type: String, default: '' },
  farmerWallet: { type: String, default: '' },
  amount: { type: Number, required: true, min: 0 },
  asset: { type: String, default: 'USDC' },
  note: { type: String, default: '' },
  timestamp: { type: Date, default: () => new Date() }
}, baseSchemaOptions(10, ret => {
  // Keep timestamp as ISO string in API responses (matches prior shape).
  if (ret.timestamp instanceof Date) ret.timestamp = ret.timestamp.toISOString();
}));

// Payouts are listed newest-first.
PayoutSchema.index({ timestamp: -1 });

export default mongoose.model('Payout', PayoutSchema);
