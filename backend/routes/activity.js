import { Router } from 'express';
import ActivityLog from '../models/ActivityLog.js';
import { requireRole } from '../middleware/auth.js';
import { asyncH } from './_async.js';

const r = Router();

/**
 * GET /api/activity
 * List activity logs with pagination and filtering.
 *
 * Query params:
 *   - limit: Number of results (default: 50, max: 200)
 *   - offset: Skip N results (default: 0)
 *   - actionType: Filter by action type (optional, comma-separated for multiple)
 *   - userRole: Filter by user role (optional)
 *   - status: Filter by status (optional)
 *   - userId: Filter by userId (optional, self or admin only)
 *   - startDate: ISO timestamp (optional, >=)
 *   - endDate: ISO timestamp (optional, <=)
 *   - entityType: Filter by entity type (optional)
 */
r.get('/', requireRole('admin'), asyncH(async (req, res) => {
  const {
    limit = 50,
    offset = 0,
    actionType,
    userRole,
    status,
    userId,
    startDate,
    endDate,
    entityType
  } = req.query;

  // Build filter
  const filter = {};

  if (actionType) {
    const types = actionType.split(',').map(t => t.trim());
    filter.actionType = { $in: types };
  }

  if (userRole) {
    filter.userRole = userRole;
  }

  if (status) {
    filter.status = status;
  }

  if (userId) {
    filter.userId = userId;
  }

  if (entityType) {
    filter.entityType = entityType;
  }

  // Date range filter
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      filter.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      filter.createdAt.$lte = new Date(endDate);
    }
  }

  const parsedLimit = Math.min(parseInt(limit) || 50, 200);
  const parsedOffset = Math.max(parseInt(offset) || 0, 0);

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .skip(parsedOffset)
      .lean(),
    ActivityLog.countDocuments(filter)
  ]);

  res.json({
    data: logs.map(doc => ({
      id: doc._id,
      userId: doc.userId,
      userRole: doc.userRole,
      actionType: doc.actionType,
      entityType: doc.entityType,
      entityId: doc.entityId,
      description: doc.description,
      txHash: doc.txHash,
      status: doc.status,
      metadata: doc.metadata,
      createdAt: doc.createdAt
    })),
    pagination: {
      limit: parsedLimit,
      offset: parsedOffset,
      total,
      pages: Math.ceil(total / parsedLimit)
    }
  });
}));

/**
 * GET /api/activity/:id
 * Get a single activity log by ID.
 */
r.get('/:id', requireRole('admin'), asyncH(async (req, res) => {
  const log = await ActivityLog.findById(req.params.id).lean();
  if (!log) {
    return res.status(404).json({ error: 'activity log not found' });
  }

  res.json({
    id: log._id,
    userId: log.userId,
    userRole: log.userRole,
    actionType: log.actionType,
    entityType: log.entityType,
    entityId: log.entityId,
    description: log.description,
    txHash: log.txHash,
    status: log.status,
    metadata: log.metadata,
    createdAt: log.createdAt
  });
}));

/**
 * GET /api/activity/summary/recent
 * Get recent activity summary (last N logs, grouped by action type).
 * Useful for dashboard widget.
 */
r.get('/summary/recent', requireRole('admin'), asyncH(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  const logs = await ActivityLog.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const summary = {
    totalByType: {},
    recent: logs.map(doc => ({
      id: doc._id,
      actionType: doc.actionType,
      entityType: doc.entityType,
      description: doc.description,
      status: doc.status,
      createdAt: doc.createdAt
    }))
  };

  logs.forEach(log => {
    summary.totalByType[log.actionType] = (summary.totalByType[log.actionType] || 0) + 1;
  });

  res.json(summary);
}));

export default r;
