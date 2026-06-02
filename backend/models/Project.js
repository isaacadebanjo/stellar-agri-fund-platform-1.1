import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

export const PROJECT_STATUSES = ['active', 'paused', 'completed', 'cancelled'];

const ProjectSchema = new mongoose.Schema({
  _id: idField(8),
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  cropType: { type: String, default: '' },
  status: { type: String, enum: PROJECT_STATUSES, default: 'active', index: true },
  startDate: { type: String, default: '' }, // kept as ISO date string to match prior shape
  endDate: { type: String, default: '' },
  allocated: { type: Number, default: 0, min: 0 },
  spent: { type: Number, default: 0, min: 0 },
  // Hectares under cultivation — feeds per-hectare KPIs. Additive, defaults to 0.
  hectares: { type: Number, default: 0, min: 0 },
  // When true, treasury allocations to this project are gated on approved
  // milestone release budget (milestone-based capital release). Off by default
  // so existing projects/flows are unaffected.
  governanceEnabled: { type: Boolean, default: false }
}, baseSchemaOptions());

export default mongoose.model('Project', ProjectSchema);
