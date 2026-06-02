import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

export const INVOICE_STATUSES = ['unpaid', 'partial', 'paid'];

// A payment-cycle record for buyer billing: issued → due → paid. Drives the
// payment metrics (overdue alerts, average payment cycle, cash conversion).
// Dates are ISO date strings; days-outstanding is derived in the route, not
// stored, so it's always current.
const InvoiceSchema = new mongoose.Schema({
  _id: idField(),
  number: { type: String, required: true, trim: true },
  buyerId: { type: String, required: true, index: true },
  deliveryId: { type: String, default: null, index: true },
  offtakeId: { type: String, default: null, index: true },
  issuedDate: { type: String, default: '' },
  dueDate: { type: String, default: '' },
  paidDate: { type: String, default: '' },
  amountDue: { type: Number, default: 0, min: 0 },
  amountPaid: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: INVOICE_STATUSES, default: 'unpaid', index: true }
}, baseSchemaOptions());

InvoiceSchema.index({ createdAt: -1 });

export default mongoose.model('Invoice', InvoiceSchema);
