import { Router } from 'express';
import FarmVisit, { OPERATIONAL_STATUSES } from '../models/FarmVisit.js';
import Project from '../models/Project.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { paginate, listResponse } from '../services/pagination.js';
import { round, sum } from '../services/money.js';
import { id, optionalString, optionalIsoDate, enumValue } from '../services/validate.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

async function withProject(rows) {
  const ids = [...new Set(rows.map(v => v.projectId))];
  const projects = await Project.find({ _id: { $in: ids } }).lean();
  const name = new Map(projects.map(p => [p._id, p.name]));
  return rows.map(v => ({ ...v, projectName: name.get(v.projectId) || 'Unknown' }));
}

// Operational monitoring summary: average health/compliance, status breakdown,
// and the most recent visits.
r.get('/summary', asyncH(async (req, res) => {
  const visits = await FarmVisit.find().lean();
  const count = visits.length;
  const avgHealth = count ? round(sum(visits, v => v.farmHealthScore) / count) : 0;
  const avgCompliance = count ? round(sum(visits, v => v.complianceScore) / count) : 0;
  const statusBreakdown = OPERATIONAL_STATUSES.reduce((acc, s) => {
    acc[s] = visits.filter(v => v.operationalStatus === s).length;
    return acc;
  }, {});
  const recent = visits
    .slice()
    .sort((a, b) => new Date(b.visitDate || b.createdAt) - new Date(a.visitDate || a.createdAt))
    .slice(0, 5);
  res.json({
    count,
    avgHealthScore: avgHealth,
    avgComplianceScore: avgCompliance,
    statusBreakdown,
    recent: await withProject(recent.map(v => ({ id: v._id, ...v, _id: undefined })))
  });
}));

r.get('/', asyncH(async (req, res) => {
  const filter = {};
  if (req.query.projectId) filter.projectId = req.query.projectId;
  if (req.query.operationalStatus) filter.operationalStatus = req.query.operationalStatus;

  const pg = paginate(req.query);
  const cursor = FarmVisit.find(filter).sort({ visitDate: -1, createdAt: -1 });
  if (pg) cursor.skip(pg.skip).limit(pg.limit);
  const [docs, total] = await Promise.all([
    cursor.lean(),
    pg ? FarmVisit.countDocuments(filter) : Promise.resolve(0)
  ]);
  const rows = await withProject(docs.map(d => ({ id: d._id, ...d, _id: undefined })));
  res.json(pg ? listResponse(rows, total, pg) : rows);
}));

r.post('/', asyncH(async (req, res) => {
  const projectId = id(req.body?.projectId, 'projectId');
  if (!(await Project.findById(projectId))) return res.status(404).json({ error: 'project not found' });
  optionalIsoDate(req.body?.visitDate, 'visitDate');
  if (req.body?.operationalStatus !== undefined) {
    enumValue(req.body.operationalStatus, OPERATIONAL_STATUSES, 'operationalStatus');
  }

  const doc = await FarmVisit.create({
    projectId,
    inspector: optionalString(req.body?.inspector),
    visitDate: req.body?.visitDate || '',
    gpsLat: req.body?.gpsLat === undefined || req.body?.gpsLat === '' ? null : Number(req.body.gpsLat),
    gpsLng: req.body?.gpsLng === undefined || req.body?.gpsLng === '' ? null : Number(req.body.gpsLng),
    gpsNotes: optionalString(req.body?.gpsNotes),
    comments: optionalString(req.body?.comments),
    findings: optionalString(req.body?.findings),
    photos: Array.isArray(req.body?.photos) ? req.body.photos : [],
    farmHealthScore: clamp100(req.body?.farmHealthScore),
    complianceScore: clamp100(req.body?.complianceScore),
    operationalStatus: req.body?.operationalStatus || 'on_track'
  });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.CREATE_FARM_VISIT,
    entityType: EntityTypes.FARM_VISIT,
    entityId: doc._id.toString(),
    description: `Farm visit recorded — health ${doc.farmHealthScore}, compliance ${doc.complianceScore} (${doc.operationalStatus})`,
    status: ActivityStatus.SUCCESS,
    metadata: { projectId, operationalStatus: doc.operationalStatus }
  });

  const [enriched] = await withProject([{ id: doc._id, ...doc.toObject(), _id: undefined }]);
  res.status(201).json(enriched);
}));

r.patch('/:id', asyncH(async (req, res) => {
  const update = {};
  if (req.body?.inspector !== undefined) update.inspector = optionalString(req.body.inspector);
  if (req.body?.visitDate !== undefined) { optionalIsoDate(req.body.visitDate, 'visitDate'); update.visitDate = req.body.visitDate || ''; }
  if (req.body?.gpsLat !== undefined) update.gpsLat = req.body.gpsLat === '' ? null : Number(req.body.gpsLat);
  if (req.body?.gpsLng !== undefined) update.gpsLng = req.body.gpsLng === '' ? null : Number(req.body.gpsLng);
  if (req.body?.gpsNotes !== undefined) update.gpsNotes = optionalString(req.body.gpsNotes);
  if (req.body?.comments !== undefined) update.comments = optionalString(req.body.comments);
  if (req.body?.findings !== undefined) update.findings = optionalString(req.body.findings);
  if (Array.isArray(req.body?.photos)) update.photos = req.body.photos;
  if (req.body?.farmHealthScore !== undefined) update.farmHealthScore = clamp100(req.body.farmHealthScore);
  if (req.body?.complianceScore !== undefined) update.complianceScore = clamp100(req.body.complianceScore);
  if (req.body?.operationalStatus !== undefined) {
    update.operationalStatus = enumValue(req.body.operationalStatus, OPERATIONAL_STATUSES, 'operationalStatus');
  }

  const doc = await FarmVisit.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ error: 'farm visit not found' });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.UPDATE_FARM_VISIT,
    entityType: EntityTypes.FARM_VISIT,
    entityId: doc._id.toString(),
    description: 'Farm visit updated',
    status: ActivityStatus.SUCCESS,
    metadata: { updatedFields: Object.keys(update) }
  });

  const [enriched] = await withProject([{ id: doc._id, ...doc.toObject(), _id: undefined }]);
  res.json(enriched);
}));

export default r;
