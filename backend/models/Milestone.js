import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

export const MILESTONE_STATUSES = ['pending', 'approved', 'rejected'];

// A project milestone for milestone-based capital release (e.g. "Land prepared",
// "Planting completed"). `releaseAmount` is the treasury budget unlocked once
// the milestone is approved; when a project has governanceEnabled, allocations
// are capped at the sum of approved milestones' releaseAmount.
const MilestoneSchema = new mongoose.Schema({
  _id: idField(),
  projectId: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  targetDate: { type: String, default: '' },
  completionPercent: { type: Number, default: 0, min: 0, max: 100 },
  releaseAmount: { type: Number, default: 0, min: 0 },
  // Verification documents — stored as references (name + URL), no file upload.
  verificationDocs: { type: [{ name: String, url: String }], default: [] },
  approvalStatus: { type: String, enum: MILESTONE_STATUSES, default: 'pending', index: true },
  approvedBy: { type: String, default: null },
  decisionAt: { type: Date, default: null }
}, baseSchemaOptions(8, ret => {
  if (ret.decisionAt instanceof Date) ret.decisionAt = ret.decisionAt.toISOString();
}));

export default mongoose.model('Milestone', MilestoneSchema);
