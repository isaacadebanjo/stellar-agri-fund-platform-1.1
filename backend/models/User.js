import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

export const ROLES = ['admin', 'investor'];

const UserSchema = new mongoose.Schema({
  _id: idField(8),
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ROLES, required: true, index: true },
  // Only set for role: 'investor' — links the user to their Investor doc
  // so investor accounts can only view their own data.
  investorId: { type: String, default: null, index: true }
}, baseSchemaOptions(8, ret => {
  // Never leak the password hash in API responses.
  delete ret.passwordHash;
}));

export default mongoose.model('User', UserSchema);
