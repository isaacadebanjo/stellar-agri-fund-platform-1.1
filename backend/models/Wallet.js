import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

const WalletSchema = new mongoose.Schema({
  _id: idField(8),
  label: { type: String, required: true, trim: true },
  publicKey: { type: String, required: true },
  secret: { type: String, required: true },
  type: { type: String, enum: ['treasury', 'investor'], required: true, index: true },
  balance: { type: Number, default: 0, min: 0 }
}, baseSchemaOptions());

export default mongoose.model('Wallet', WalletSchema);
