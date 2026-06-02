import { Router } from 'express';
import Yield from '../models/Yield.js';
import Project from '../models/Project.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { paginate, listResponse } from '../services/pagination.js';
import { round, sum } from '../services/money.js';
import { id, optionalString, nonNegativeNumber, optionalIsoDate } from '../services/validate.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

// Variance = actual − expected; variancePercent relative to expected.
function withVariance(y) {
  const variance = round((y.actualYield || 0) - (y.expectedYield || 0));
  const variancePercent = y.expectedYield > 0 ? round((variance / y.expectedYield) * 100) : 0;
  return { ...y, yieldVariance: variance, variancePercent };
}

async function withProject(rows) {
  const ids = [...new Set(rows.map(y => y.projectId))];
  const projects = await Project.find({ _id: { $in: ids } }).lean();
  const name = new Map(projects.map(p => [p._id, p.name]));
  return rows.map(y => ({ ...withVariance(y), projectName: name.get(y.projectId) || 'Unknown' }));
}

// Yield efficiency + trends for the dashboard.
r.get('/summary', asyncH(async (req, res) => {
  const yields = await Yield.find().lean();
  const totalExpected = sum(yields, y => y.expectedYield);
  const totalActual = sum(yields, y => y.actualYield);
  const totalRevenue = sum(yields, y => y.revenueGenerated);

  // Trend: actual vs expected by harvest date (chronological).
  const trend = yields
    .filter(y => y.harvestDate)
    .sort((a, b) => new Date(a.harvestDate) - new Date(b.harvestDate))
    .map(y => ({
      date: y.harvestDate,
      cropType: y.cropType,
      expected: y.expectedYield,
      actual: y.actualYield
    }));

  res.json({
    records: yields.length,
    totalExpected,
    totalActual,
    totalRevenue,
    efficiencyPercent: totalExpected > 0 ? round((totalActual / totalExpected) * 100) : 0,
    trend
  });
}));

r.get('/', asyncH(async (req, res) => {
  const filter = {};
  if (req.query.projectId) filter.projectId = req.query.projectId;

  const pg = paginate(req.query);
  const cursor = Yield.find(filter).sort({ createdAt: -1 });
  if (pg) cursor.skip(pg.skip).limit(pg.limit);
  const [docs, total] = await Promise.all([
    cursor.lean(),
    pg ? Yield.countDocuments(filter) : Promise.resolve(0)
  ]);
  const rows = await withProject(docs.map(d => ({ id: d._id, ...d, _id: undefined })));
  res.json(pg ? listResponse(rows, total, pg) : rows);
}));

r.post('/', asyncH(async (req, res) => {
  const projectId = id(req.body?.projectId, 'projectId');
  if (!(await Project.findById(projectId))) return res.status(404).json({ error: 'project not found' });
  optionalIsoDate(req.body?.plantingDate, 'plantingDate');
  optionalIsoDate(req.body?.harvestDate, 'harvestDate');

  const doc = await Yield.create({
    projectId,
    cropType: optionalString(req.body?.cropType),
    plantingDate: req.body?.plantingDate || '',
    harvestDate: req.body?.harvestDate || '',
    expectedYield: nonNegativeNumber(req.body?.expectedYield ?? 0, 'expectedYield'),
    actualYield: nonNegativeNumber(req.body?.actualYield ?? 0, 'actualYield'),
    unit: optionalString(req.body?.unit) || 'kg',
    revenueGenerated: nonNegativeNumber(req.body?.revenueGenerated ?? 0, 'revenueGenerated')
  });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.RECORD_YIELD,
    entityType: EntityTypes.YIELD,
    entityId: doc._id.toString(),
    description: `Yield recorded for project — ${doc.actualYield}/${doc.expectedYield} ${doc.unit}`,
    status: ActivityStatus.SUCCESS,
    metadata: { projectId, expectedYield: doc.expectedYield, actualYield: doc.actualYield }
  });

  const [enriched] = await withProject([{ id: doc._id, ...doc.toObject(), _id: undefined }]);
  res.status(201).json(enriched);
}));

r.patch('/:id', asyncH(async (req, res) => {
  const update = {};
  if (req.body?.cropType !== undefined) update.cropType = optionalString(req.body.cropType);
  if (req.body?.unit !== undefined) update.unit = optionalString(req.body.unit) || 'kg';
  if (req.body?.plantingDate !== undefined) { optionalIsoDate(req.body.plantingDate, 'plantingDate'); update.plantingDate = req.body.plantingDate || ''; }
  if (req.body?.harvestDate !== undefined) { optionalIsoDate(req.body.harvestDate, 'harvestDate'); update.harvestDate = req.body.harvestDate || ''; }
  if (req.body?.expectedYield !== undefined) update.expectedYield = nonNegativeNumber(req.body.expectedYield, 'expectedYield');
  if (req.body?.actualYield !== undefined) update.actualYield = nonNegativeNumber(req.body.actualYield, 'actualYield');
  if (req.body?.revenueGenerated !== undefined) update.revenueGenerated = nonNegativeNumber(req.body.revenueGenerated, 'revenueGenerated');

  const doc = await Yield.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ error: 'yield record not found' });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.UPDATE_YIELD,
    entityType: EntityTypes.YIELD,
    entityId: doc._id.toString(),
    description: 'Yield record updated',
    status: ActivityStatus.SUCCESS,
    metadata: { updatedFields: Object.keys(update) }
  });

  const [enriched] = await withProject([{ id: doc._id, ...doc.toObject(), _id: undefined }]);
  res.json(enriched);
}));

export default r;
