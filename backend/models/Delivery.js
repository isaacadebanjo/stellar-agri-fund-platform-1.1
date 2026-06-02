import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

export const DELIVERY_PAYMENT_STATUSES = ['pending', 'partial', 'paid'];

// A physical delivery of harvested produce against an offtake agreement.
// invoiceAmount is denormalized (quantity × price). Links to the offtake (to
// compute delivered-vs-contracted), the project, and the buyer.
const DeliverySchema = new mongoose.Schema({
  _id: idField(),
  harvestBatch: { type: String, default: '' },
  deliveryDate: { type: String, default: '' },
  buyerId: { type: String, required: true, index: true },
  offtakeId: { type: String, default: null, index: true },
  projectId: { type: String, default: null, index: true },
  quantityDelivered: { type: Number, default: 0, min: 0 },
  unit: { type: String, default: 'kg' },
  unitPrice: { type: Number, default: 0, min: 0 },
  invoiceAmount: { type: Number, default: 0, min: 0 },
  paymentStatus: { type: String, enum: DELIVERY_PAYMENT_STATUSES, default: 'pending', index: true }
}, baseSchemaOptions());

DeliverySchema.index({ createdAt: -1 });

export default mongoose.model('Delivery', DeliverySchema);
