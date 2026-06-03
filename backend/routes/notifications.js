import { Router } from 'express';
import Notification from '../models/Notification.js';
import { asyncH } from './_async.js';
import { paginate, listResponse } from '../services/pagination.js';
import { visibilityFilter, toApiNotification } from '../services/notify.js';

// Notification center. Available to admins and investors alike (global
// requireAuth in server.js applies); each user only sees notifications scoped to
// their audience. Read-state is tracked per user via the notification's readBy.
const r = Router();

// GET /api/notifications — newest first, with per-user `read` flag.
r.get('/', asyncH(async (req, res) => {
  const filter = visibilityFilter(req.user);
  const pg = paginate(req.query) || { page: 1, limit: 30, skip: 0 };
  const [docs, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit),
    Notification.countDocuments(filter)
  ]);
  const data = docs.map(d => toApiNotification(d, req.user.id));
  res.json(listResponse(data, total, pg));
}));

// GET /api/notifications/unread-count — badge count for the bell.
r.get('/unread-count', asyncH(async (req, res) => {
  const filter = { ...visibilityFilter(req.user), readBy: { $ne: req.user.id } };
  res.json({ unread: await Notification.countDocuments(filter) });
}));

// POST /api/notifications/:id/read — mark one read for this user.
r.post('/:id/read', asyncH(async (req, res) => {
  const filter = { _id: req.params.id, ...visibilityFilter(req.user) };
  const doc = await Notification.findOneAndUpdate(
    filter,
    { $addToSet: { readBy: req.user.id } },
    { new: true }
  );
  if (!doc) return res.status(404).json({ error: 'notification not found' });
  res.json(toApiNotification(doc, req.user.id));
}));

// POST /api/notifications/read-all — mark every visible notification read.
r.post('/read-all', asyncH(async (req, res) => {
  const filter = { ...visibilityFilter(req.user), readBy: { $ne: req.user.id } };
  const result = await Notification.updateMany(filter, { $addToSet: { readBy: req.user.id } });
  res.json({ updated: result.modifiedCount ?? 0 });
}));

export default r;
