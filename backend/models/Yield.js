import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

// A crop yield record for a project's growing cycle. Expected vs actual yield
// drives yield-efficiency KPIs; revenueGenerated ties yield to financial return.
// Variance is derived in the route (not stored) so it's always consistent.
const YieldSchema = new mongoose.Schema({
  _id: idField(),
  projectId: { type: String, required: true, index: true },
  cropType: { type: String, default: '' },
  plantingDate: { type: String, default: '' },
  harvestDate: { type: String, default: '' },
  expectedYield: { type: Number, default: 0, min: 0 },
  actualYield: { type: Number, default: 0, min: 0 },
  unit: { type: String, default: 'kg' },
  revenueGenerated: { type: Number, default: 0, min: 0 }
}, baseSchemaOptions());

YieldSchema.index({ harvestDate: 1 });

export default mongoose.model('Yield', YieldSchema);
