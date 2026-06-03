import { Router } from 'express';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { getKpiOverview } from '../services/kpiAnalytics.js';

const r = Router();
r.use(requireRole('admin'));

// Executive operational KPIs. Computation lives in services/kpiAnalytics.js so
// the presentation/snapshot layer can reuse it; the response shape is unchanged.
r.get('/overview', asyncH(async (req, res) => {
  res.json(await getKpiOverview());
}));

export default r;
