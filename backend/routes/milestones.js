import { Router } from 'express';
import Milestone from '../models/Milestone.js';
import Project from '../models/Project.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { round } from '../services/money.js';
import { id, nonEmptyString, optionalString, nonNegativeNumber, optionalIsoDate } from '../services/validate.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

function clampPercent(v, field) {
  const n = nonNegativeNumber(v, field);
  if (n > 100) return 100;
  return n;
}

r.get('/', asyncH(async (req, res) => {
  const filter = {};
  if (req.query.projectId) filter.projectId = req.query.projectId;
  const rows = await Milestone.find(filter).sort({ createdAt: 1 });
  res.json(rows.map(m => m.toJSON()));
}));

// Approved release budget per project (sum of approved milestones' releaseAmount).
r.get('/release-budget/:projectId', asyncH(async (req, res) => {
  const agg = await Milestone.aggregate([
    { $match: { projectId: req.params.projectId, approvalStatus: 'approved' } },
    { $group: { _id: null, total: { $sum: '$releaseAmount' } } }
  ]);
  const project = await Project.findById(req.params.projectId).lean();
  res.json({
    projectId: req.params.projectId,
    approvedReleaseBudget: round(agg[0]?.total || 0),
    allocated: round(project?.allocated || 0),
    governanceEnabled: Boolean(project?.governanceEnabled)
  });
}));

r.post('/', asyncH(async (req, res) => {
  const projectId = id(req.body?.projectId, 'projectId');
  if (!(await Project.findById(projectId))) return res.status(404).json({ error: 'project not found' });
  optionalIsoDate(req.body?.targetDate, 'targetDate');
  const docs = Array.isArray(req.body?.verificationDocs) ? req.body.verificationDocs : [];

  const doc = await Milestone.create({
    projectId,
    title: nonEmptyString(req.body?.title, 'title'),
    description: optionalString(req.body?.description),
    targetDate: req.body?.targetDate || '',
    completionPercent: req.body?.completionPercent === undefined ? 0 : clampPercent(req.body.completionPercent, 'completionPercent'),
    releaseAmount: nonNegativeNumber(req.body?.releaseAmount ?? 0, 'releaseAmount'),
    verificationDocs: docs.map(d => ({ name: String(d?.name || ''), url: String(d?.url || '') }))
  });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.CREATE_MILESTONE,
    entityType: EntityTypes.MILESTONE,
    entityId: doc._id.toString(),
    description: `Milestone "${doc.title}" created (release ${doc.releaseAmount} XLM)`,
    status: ActivityStatus.SUCCESS,
    metadata: { projectId, releaseAmount: doc.releaseAmount }
  });

  res.status(201).json(doc.toJSON());
}));

r.patch('/:id', asyncH(async (req, res) => {
  const update = {};
  if (req.body?.title !== undefined) update.title = nonEmptyString(req.body.title, 'title');
  if (req.body?.description !== undefined) update.description = optionalString(req.body.description);
  if (req.body?.targetDate !== undefined) { optionalIsoDate(req.body.targetDate, 'targetDate'); update.targetDate = req.body.targetDate || ''; }
  if (req.body?.completionPercent !== undefined) update.completionPercent = clampPercent(req.body.completionPercent, 'completionPercent');
  if (req.body?.releaseAmount !== undefined) update.releaseAmount = nonNegativeNumber(req.body.releaseAmount, 'releaseAmount');
  if (Array.isArray(req.body?.verificationDocs)) {
    update.verificationDocs = req.body.verificationDocs.map(d => ({ name: String(d?.name || ''), url: String(d?.url || '') }));
  }

  const doc = await Milestone.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ error: 'milestone not found' });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.UPDATE_MILESTONE,
    entityType: EntityTypes.MILESTONE,
    entityId: doc._id.toString(),
    description: `Milestone "${doc.title}" updated`,
    status: ActivityStatus.SUCCESS,
    metadata: { updatedFields: Object.keys(update) }
  });

  res.json(doc.toJSON());
}));

async function decide(req, res, approvalStatus, actionType) {
  const doc = await Milestone.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'milestone not found' });
  doc.approvalStatus = approvalStatus;
  doc.approvedBy = req.user?.id || null;
  doc.decisionAt = new Date();
  if (approvalStatus === 'approved') doc.completionPercent = 100;
  await doc.save();

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType,
    entityType: EntityTypes.MILESTONE,
    entityId: doc._id.toString(),
    description: `Milestone "${doc.title}" ${approvalStatus}`,
    status: ActivityStatus.SUCCESS,
    metadata: { projectId: doc.projectId, releaseAmount: doc.releaseAmount }
  });

  res.json(doc.toJSON());
}

r.post('/:id/approve', asyncH((req, res) => decide(req, res, 'approved', ActivityTypes.MILESTONE_APPROVED)));
r.post('/:id/reject', asyncH((req, res) => decide(req, res, 'rejected', ActivityTypes.MILESTONE_REJECTED)));

export default r;
