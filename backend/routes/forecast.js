import { Router } from 'express';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { getForecast } from '../services/forecast.js';

const r = Router();
r.use(requireRole('admin'));

// 30 / 90 / 365-day treasury liquidity forecast from contracted inflows and
// pending obligations. Read-only.
r.get('/overview', asyncH(async (req, res) => {
  res.json(await getForecast());
}));

export default r;
