import { Router } from 'express';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import {
  getTreasuryOverview,
  getTreasuryFlows,
  getPendingObligations,
  getTreasuryTransactions
} from '../services/treasuryAnalytics.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();

/**
 * GET /api/treasury/health
 * Simple health check - no auth required. Useful for verifying endpoint is accessible.
 */
r.get('/health', asyncH(async (req, res) => {
  res.json({
    status: 'ok',
    message: 'Treasury API is running',
    timestamp: new Date().toISOString()
  });
}));

r.use(requireRole('admin'));

/**
 * GET /api/treasury/overview
 * Return comprehensive treasury metrics: balance, invested, allocated, liquidity, pending obligations
 */
r.get('/overview', asyncH(async (req, res) => {
  const overview = await getTreasuryOverview();
  
  // Log treasury report view (optional - for audit trail)
  setImmediate(() => {
    logActivity({
      user: req.user,
      actionType: ActivityTypes.VIEW_TREASURY_REPORT,
      entityType: EntityTypes.REPORT,
      entityId: 'treasury-overview',
      description: 'Viewed treasury overview dashboard',
      status: ActivityStatus.SUCCESS
    });
  });

  res.json(overview);
}));

/**
 * GET /api/treasury/flows
 * Return historical treasury flows for chart visualization
 * Query params:
 *   - days: number of days to look back (default: 90)
 */
r.get('/flows', asyncH(async (req, res) => {
  const days = Math.min(Number(req.query.days) || 90, 365); // Cap at 1 year
  const flows = await getTreasuryFlows(days);
  res.json(flows);
}));

/**
 * GET /api/treasury/obligations
 * Return pending obligations: failed transactions, unpaid distributions, pending payouts
 */
r.get('/obligations', asyncH(async (req, res) => {
  const obligations = await getPendingObligations();
  res.json(obligations);
}));

/**
 * GET /api/treasury/transactions
 * Return treasury transactions with pagination and filtering
 * Query params:
 *   - page: page number (default: 1)
 *   - limit: items per page (default: 20, max: 100)
 *   - status: 'pending', 'success', 'failed' (optional)
 *   - type: 'inflow', 'outflow' (optional)
 */
r.get('/transactions', asyncH(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const status = req.query.status;
  const type = req.query.type;

  const result = await getTreasuryTransactions({
    page,
    limit,
    status,
    type
  });

  res.json(result);
}));

export default r;
