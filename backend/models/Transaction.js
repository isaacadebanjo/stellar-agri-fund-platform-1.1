import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

export const TX_STAGES = ['investment', 'allocation', 'payout'];

const TransactionSchema = new mongoose.Schema({
  _id: idField(10),
  stage: { type: String, enum: TX_STAGES, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  asset: { type: String, default: 'USDC' },
  senderId: { type: String, default: '' },
  senderLabel: { type: String, default: '' },
  receiverId: { type: String, default: '' },
  receiverLabel: { type: String, default: '' },
  projectId: { type: String, default: null, index: true },
  txHash: { type: String, default: '' },
  timestamp: { type: Date, default: () => new Date() }
}, baseSchemaOptions(10, ret => {
  if (ret.timestamp instanceof Date) ret.timestamp = ret.timestamp.toISOString();
}));

export default mongoose.model('Transaction', TransactionSchema);
