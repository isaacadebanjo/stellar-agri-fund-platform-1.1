import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

export const TX_STAGES = ['investment', 'allocation', 'payout'];
export const TX_STATUSES = ['pending', 'success', 'failed'];

const TransactionSchema = new mongoose.Schema({
  _id: idField(10),
  stage: { type: String, enum: TX_STAGES, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  asset: { type: String, default: 'XLM' },
  senderId: { type: String, default: '' },
  senderLabel: { type: String, default: '' },
  receiverId: { type: String, default: '' },
  receiverLabel: { type: String, default: '' },
  projectId: { type: String, default: null, index: true },
  txHash: { type: String, default: '' },
  // Real Stellar testnet fields. `status` is 'success' for both real submitted
  // payments and book-keeping entries (allocations/payouts). 'failed' is set
  // when a Horizon submission throws.
  status: { type: String, enum: TX_STATUSES, default: 'success', index: true },
  ledger: { type: Number, default: null },
  network: { type: String, default: 'internal' }, // 'stellar-testnet' for real txs
  errorCode: { type: String, default: '' },
  timestamp: { type: Date, default: () => new Date() }
}, baseSchemaOptions(10, ret => {
  if (ret.timestamp instanceof Date) ret.timestamp = ret.timestamp.toISOString();
}));

export default mongoose.model('Transaction', TransactionSchema);
