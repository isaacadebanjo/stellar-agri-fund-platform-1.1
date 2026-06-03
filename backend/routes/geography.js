import { Router } from 'express';
import Project from '../models/Project.js';
import Buyer from '../models/Buyer.js';
import Revenue from '../models/Revenue.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { COUNTRIES, countryName } from '../services/countries.js';
import { round } from '../services/money.js';

const r = Router();

// The supported-markets taxonomy (countries, currencies, regions). Available to
// any authenticated user so frontend selectors can populate.
r.get('/countries', asyncH(async (req, res) => {
  res.json({ countries: COUNTRIES });
}));

// Per-country portfolio rollup: projects, capital deployed, hectares, buyers and
// revenue grouped by country. Admin only (operational view).
r.get('/overview', requireRole('admin'), asyncH(async (req, res) => {
  const [projects, buyers, revAgg] = await Promise.all([
    Project.find().lean(),
    Buyer.find({ archived: false }).lean(),
    Revenue.aggregate([{ $group: { _id: '$projectId', total: { $sum: '$amount' } } }])
  ]);
  const revByProject = new Map(revAgg.map(g => [g._id, g.total]));

  const byCountry = new Map();
  const ensure = (code) => {
    if (!byCountry.has(code)) {
      byCountry.set(code, {
        country: code,
        name: code === 'Unassigned' ? 'Unassigned' : countryName(code),
        currency: COUNTRIES.find(c => c.code === code)?.currency || '',
        projects: 0, activeProjects: 0, allocated: 0, hectares: 0,
        revenue: 0, buyers: 0, regions: new Set()
      });
    }
    return byCountry.get(code);
  };

  for (const p of projects) {
    const code = p.country || 'Unassigned';
    const row = ensure(code);
    row.projects += 1;
    if (p.status === 'active') row.activeProjects += 1;
    row.allocated += p.allocated || 0;
    row.hectares += p.hectares || 0;
    row.revenue += revByProject.get(p._id) || 0;
    if (p.region) row.regions.add(p.region);
  }
  for (const b of buyers) {
    const code = b.country || 'Unassigned';
    ensure(code).buyers += 1;
  }

  const rows = [...byCountry.values()].map(row => ({
    ...row,
    allocated: round(row.allocated),
    hectares: round(row.hectares),
    revenue: round(row.revenue),
    regions: [...row.regions]
  })).sort((a, b) => b.allocated - a.allocated);

  res.json({
    countries: rows,
    totals: {
      countries: rows.filter(r => r.country !== 'Unassigned' && r.projects > 0).length,
      projects: projects.length,
      buyers: buyers.length,
      allocated: round(rows.reduce((a, r) => a + r.allocated, 0))
    }
  });
}));

export default r;
