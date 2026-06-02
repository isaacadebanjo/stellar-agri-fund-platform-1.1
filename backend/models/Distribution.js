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
  // Links back to the DistributionRun that produced this row, plus the
  // reporting period it covers (denormalized so single-row queries don't need
  // a join). The run's unique (projectId, periodStart, periodEnd) index is what
  // actually prevents duplicate generation.
  runId: { type: String, default: null, index: true },
  periodStart: { type: Date, default: null },
  periodEnd: { type: Date, default: null },
  // Real Stellar payout details, set when the distribution is paid.
  txHash: { type: String, default: '' },
  network: { type: String, default: '' },
  timestamp: { type: Date, default: () => new Date() },
  paidAt: { type: Date, default: null }
}, baseSchemaOptions(10, ret => {
  if (ret.timestamp instanceof Date) ret.timestamp = ret.timestamp.toISOString();
  if (ret.paidAt instanceof Date) ret.paidAt = ret.paidAt.toISOString();
  if (ret.periodStart instanceof Date) ret.periodStart = ret.periodStart.toISOString();
  if (ret.periodEnd instanceof Date) ret.periodEnd = ret.periodEnd.toISOString();
}));

// Common access patterns: list newest-first, and per-investor history.
DistributionSchema.index({ timestamp: -1 });
DistributionSchema.index({ investorId: 1, timestamp: -1 });

export default mongoose.model('Distribution', DistributionSchema);
