import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

export const NOTIFICATION_AUDIENCES = ['admin', 'investor', 'user'];
export const NOTIFICATION_LEVELS = ['info', 'success', 'warning'];

// A persisted, audience-scoped notification. The same business event can produce
// one admin-wide notification plus one per affected investor. "Read" is tracked
// per recipient via `readBy` (a list of user ids) rather than a single boolean,
// so a shared admin notification can be read independently by each admin.
//
//   audience 'admin'    → visible to every admin
//   audience 'investor' → visible to the investor whose id is `investorId`
//   audience 'user'     → visible only to the specific `userId`
const NotificationSchema = new mongoose.Schema({
  _id: idField(12),
  audience: { type: String, enum: NOTIFICATION_AUDIENCES, required: true, index: true },
  investorId: { type: String, default: null, index: true },
  userId: { type: String, default: null, index: true },
  type: { type: String, required: true },          // mirrors the ActivityTypes action
  title: { type: String, required: true },
  message: { type: String, default: '' },
  level: { type: String, enum: NOTIFICATION_LEVELS, default: 'info' },
  entityType: { type: String, default: null },
  entityId: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  readBy: { type: [String], default: [] }
}, baseSchemaOptions(12));

NotificationSchema.index({ audience: 1, createdAt: -1 });
NotificationSchema.index({ investorId: 1, createdAt: -1 });

export default mongoose.model('Notification', NotificationSchema);
