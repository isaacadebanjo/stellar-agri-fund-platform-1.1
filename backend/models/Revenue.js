import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

const RevenueSchema = new mongoose.Schema({
  _id: idField(10),
  projectId: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  source: { type: String, default: '' },
  timestamp: { type: Date, default: () => new Date() }
}, baseSchemaOptions(10, ret => {
  if (ret.timestamp instanceof Date) ret.timestamp = ret.timestamp.toISOString();
}));

export default mongoose.model('Revenue', RevenueSchema);
