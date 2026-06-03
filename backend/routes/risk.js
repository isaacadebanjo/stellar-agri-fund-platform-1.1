import { Router } from 'express';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { getRiskOverview } from '../services/riskAnalytics.js';

const r = Router();
r.use(requireRole('admin'));

// Institutional risk profile: concentration (revenue/buyer/project), liquidity,
// payment-delay and operational risk, a weighted composite score, a heatmap and
// a monthly trend. Read-only — derived from existing records.
r.get('/overview', asyncH(async (req, res) => {
  res.json(await getRiskOverview());
}));

export default r;
