import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';
import { encryptSecret, decryptSecret } from '../services/crypto.js';

const WalletSchema = new mongoose.Schema({
  _id: idField(8),
  label: { type: String, required: true, trim: true },
  publicKey: { type: String, required: true },
  // Stellar secret seed (S...). Encrypted at rest (AES-256-GCM) via the
  // setter below — the DB only ever holds ciphertext. Never returned in API
  // responses (stripped in the toJSON transform). Read it back with
  // wallet.decryptSecret(), never wallet.secret directly.
  //
  // Mongoose setters run on assignment and .create(), but NOT when a document
  // is hydrated from MongoDB — so stored ciphertext is preserved on load and
  // re-encrypted only if explicitly reassigned. encryptSecret() is idempotent,
  // so a double assignment can't double-wrap.
  secret: { type: String, required: true, set: encryptSecret },
  type: { type: String, enum: ['treasury', 'investor'], required: true, index: true },
  balance: { type: Number, default: 0, min: 0 }
}, baseSchemaOptions(8, ret => {
  delete ret.secret;
}));

// Decrypt the stored seed for signing. Handles legacy plaintext rows
// (pre-encryption) transparently until the migration runs.
WalletSchema.methods.decryptSecret = function decryptSecretMethod() {
  return decryptSecret(this.secret);
};

export default mongoose.model('Wallet', WalletSchema);
