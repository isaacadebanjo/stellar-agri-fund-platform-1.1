import mongoose from 'mongoose';

// Stores the outcome of a money-moving request so a retried/double-submitted
// POST (same Idempotency-Key) returns the original result instead of moving
// funds twice. Keyed by `${scope}:${clientKey}` so the same key on different
// endpoints can't collide. Auto-expires after 24h via a TTL index.
const IdempotencyKeySchema = new mongoose.Schema(
  {
    _id: { type: String }, // `${scope}:${clientKey}`
    scope: { type: String, required: true }, // e.g. 'POST /api/transactions/invest'
    status: {
      type: String,
      enum: ['in_progress', 'completed'],
      default: 'in_progress',
      index: true
    },
    statusCode: { type: Number, default: null },
    response: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: () => new Date(), expires: 60 * 60 * 24 }
  },
  { versionKey: false }
);

export default mongoose.model('IdempotencyKey', IdempotencyKeySchema);
