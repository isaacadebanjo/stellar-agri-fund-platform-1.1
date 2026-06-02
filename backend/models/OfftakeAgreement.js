import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

export const OFFTAKE_STATUSES = ['draft', 'active', 'completed', 'cancelled'];

// A contracted offtake agreement: a buyer commits to purchase a quantity of a
// project's crop at a unit price. contractValue is denormalized (quantity ×
// price) so dashboards don't recompute it. Dates are ISO date strings to match
// the Project model + <input type="date"> on the frontend.
const OfftakeAgreementSchema = new mongoose.Schema({
  _id: idField(),
  agreementNumber: { type: String, required: true, unique: true, trim: true },
  buyerId: { type: String, required: true, index: true },
  projectId: { type: String, required: true, index: true },
  crop: { type: String, default: '' },
  quantityCommitted: { type: Number, default: 0, min: 0 },
  unit: { type: String, default: 'kg' },
  unitPrice: { type: Number, default: 0, min: 0 },
  contractValue: { type: Number, default: 0, min: 0 },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: '' },
  status: { type: String, enum: OFFTAKE_STATUSES, default: 'active', index: true }
}, baseSchemaOptions());

OfftakeAgreementSchema.index({ buyerId: 1, status: 1 });

export default mongoose.model('OfftakeAgreement', OfftakeAgreementSchema);
