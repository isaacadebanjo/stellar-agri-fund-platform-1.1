import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

const InvestorSchema = new mongoose.Schema({
  _id: idField(8),
  name: { type: String, required: true, trim: true },
  email: { type: String, default: '', trim: true },
  walletId: { type: String, required: true, index: true }
}, baseSchemaOptions());

export default mongoose.model('Investor', InvestorSchema);
