import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

const FarmerSchema = new mongoose.Schema({
  _id: idField(8),
  name: { type: String, required: true, trim: true },
  walletId: { type: String, default: '' },
  assignedProjects: { type: [String], default: [] }
}, baseSchemaOptions());

export default mongoose.model('Farmer', FarmerSchema);
