import { Router } from 'express';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { isDemoAllowed, getDemoStatus, seedDemo, resetDemo } from '../services/demoData.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

// Demo environment generator. Admin-only AND gated by ALLOW_DEMO_SEED so it can
// never run against a real production database. Seed and reset are destructive
// and require an explicit { confirm: true } body.
const r = Router();
r.use(requireRole('admin'));

function guard(req, res) {
  if (!isDemoAllowed()) {
    res.status(403).json({ error: 'Demo seeding is disabled. Set ALLOW_DEMO_SEED=true to enable it (demo/staging only).' });
    return false;
  }
  if (req.body?.confirm !== true) {
    res.status(400).json({ error: 'This is destructive. Send { "confirm": true } to proceed.' });
    return false;
  }
  return true;
}

r.get('/status', asyncH(async (req, res) => {
  res.json(await getDemoStatus());
}));

r.post('/seed', asyncH(async (req, res) => {
  if (!guard(req, res)) return;
  const result = await seedDemo();
  logActivity({
    userId: req.user?.id, userRole: req.user?.role || 'system',
    actionType: ActivityTypes.REPORT_GENERATED, entityType: EntityTypes.SYSTEM, entityId: 'demo-seed',
    description: 'Demo environment seeded', status: ActivityStatus.SUCCESS, metadata: result.counts
  });
  res.json(result);
}));

r.post('/reset', asyncH(async (req, res) => {
  if (!guard(req, res)) return;
  await resetDemo();
  logActivity({
    userId: req.user?.id, userRole: req.user?.role || 'system',
    actionType: ActivityTypes.REPORT_GENERATED, entityType: EntityTypes.SYSTEM, entityId: 'demo-reset',
    description: 'Demo environment reset (business + ledger data cleared)', status: ActivityStatus.SUCCESS
  });
  res.json({ ok: true });
}));

export default r;
