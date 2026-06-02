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
  asset: { type: String, default: 'XLM' },
  note: { type: String, default: '' },
  // Real Stellar testnet transfer details (treasury → farmer wallet). `status`
  // is 'pending' before submission and 'success'/'failed' after.
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'success', index: true },
  txHash: { type: String, default: '' },
  ledger: { type: Number, default: null },
  network: { type: String, default: 'stellar-testnet' },
  timestamp: { type: Date, default: () => new Date() }
}, baseSchemaOptions(10, ret => {
  // Keep timestamp as ISO string in API responses (matches prior shape).
  if (ret.timestamp instanceof Date) ret.timestamp = ret.timestamp.toISOString();
}));

// Payouts are listed newest-first.
PayoutSchema.index({ timestamp: -1 });

export default mongoose.model('Payout', PayoutSchema);
