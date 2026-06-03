import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

export const OPERATIONAL_STATUSES = ['on_track', 'attention', 'at_risk'];

// An operational monitoring record: an on-site inspection of a project. Off-chain
// business record (no money movement). Photos reference managed Document records
// (same pattern as Milestone.photos), so the data room / document store stays the
// single source of truth for files. GPS is stored as numeric lat/lng plus
// free-text notes. Scores are 0–100, derived/entered at inspection time.
const FarmVisitSchema = new mongoose.Schema({
  _id: idField(),
  projectId: { type: String, required: true, index: true },
  inspector: { type: String, default: '' },
  visitDate: { type: String, default: '' },          // ISO date string, matches Project/Yield
  gpsLat: { type: Number, default: null },
  gpsLng: { type: Number, default: null },
  gpsNotes: { type: String, default: '' },
  comments: { type: String, default: '' },
  findings: { type: String, default: '' },
  // Attached site photos — references to Document records (documentId + display).
  photos: { type: [{ documentId: String, title: String, fileName: String }], default: [] },
  farmHealthScore: { type: Number, default: 0, min: 0, max: 100 },
  complianceScore: { type: Number, default: 0, min: 0, max: 100 },
  operationalStatus: { type: String, enum: OPERATIONAL_STATUSES, default: 'on_track', index: true }
}, baseSchemaOptions());

FarmVisitSchema.index({ visitDate: -1 });
FarmVisitSchema.index({ projectId: 1, createdAt: -1 });

export default mongoose.model('FarmVisit', FarmVisitSchema);
