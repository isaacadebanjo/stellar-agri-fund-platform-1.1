import mongoose from 'mongoose';

// A revoked JWT, keyed by its `jti`. Logout and refresh-rotation add a row
// here; requireAuth rejects any token whose jti is present. The TTL index
// drops the row once the token would have expired anyway, so this collection
// never grows unbounded.
const RevokedTokenSchema = new mongoose.Schema(
  {
    _id: { type: String }, // jti
    expiresAt: { type: Date, required: true }
  },
  { versionKey: false }
);

RevokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('RevokedToken', RevokedTokenSchema);
