import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

// A single "generate distributions" run for a project over a reporting period.
//
// Why a separate collection: one generate call fans out into many per-investor
// Distribution rows, so the duplicate guard can't live on Distribution itself
// (that would block the 2nd investor's row). The unique index on
// (projectId, periodStart, periodEnd) here makes a second generate for the same
// project/period fail with a duplicate-key error — caught and returned as a 409
// so an admin can't accidentally double-generate, even on a concurrent
// double-submit (the index enforces it at the DB level, not via a read+write).
const DistributionRunSchema = new mongoose.Schema({
  _id: idField(12),
  projectId: { type: String, required: true, index: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  platformFeePercent: { type: Number, default: 0, min: 0, max: 100 },
  grossProfit: { type: Number, default: 0 },
  netProfit: { type: Number, default: 0 },
  investorCount: { type: Number, default: 0 },
  timestamp: { type: Date, default: () => new Date() }
}, baseSchemaOptions(12, ret => {
  if (ret.periodStart instanceof Date) ret.periodStart = ret.periodStart.toISOString();
  if (ret.periodEnd instanceof Date) ret.periodEnd = ret.periodEnd.toISOString();
  if (ret.timestamp instanceof Date) ret.timestamp = ret.timestamp.toISOString();
}));

DistributionRunSchema.index(
  { projectId: 1, periodStart: 1, periodEnd: 1 },
  { unique: true }
);

export default mongoose.model('DistributionRun', DistributionRunSchema);
