import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

export const APPROVAL_ACTION_TYPES = ['allocation', 'payout', 'distribution', 'project_closure'];
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];

// A governance approval request for a sensitive action that exceeded its
// threshold / is flagged as requiring approval. The money route's governance
// gate creates one of these (status 'pending') instead of executing; once an
// approver approves it, the same action re-submitted is allowed through and
// the request is marked consumed so an approval can't be reused.
const ApprovalRequestSchema = new mongoose.Schema({
  _id: idField(12),
  // Stable signature of the action+params; the gate matches on this.
  key: { type: String, required: true, index: true },
  actionType: { type: String, enum: APPROVAL_ACTION_TYPES, required: true, index: true },
  status: { type: String, enum: APPROVAL_STATUSES, default: 'pending', index: true },
  amount: { type: Number, default: 0 },
  ref: { type: String, default: '' },            // e.g. projectId / farmerId
  summary: { type: String, default: '' },         // human-readable description
  payload: { type: mongoose.Schema.Types.Mixed, default: null }, // original request body
  submittedBy: { type: String, default: null },
  approvedBy: { type: String, default: null },
  decisionAt: { type: Date, default: null },
  comments: { type: String, default: '' },
  // Set when the approved action is actually executed, so it can't be reused.
  consumedAt: { type: Date, default: null }
}, baseSchemaOptions(12, ret => {
  if (ret.decisionAt instanceof Date) ret.decisionAt = ret.decisionAt.toISOString();
  if (ret.consumedAt instanceof Date) ret.consumedAt = ret.consumedAt.toISOString();
}));

ApprovalRequestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('ApprovalRequest', ApprovalRequestSchema);
