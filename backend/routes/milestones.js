import { Router } from 'express';
import Milestone from '../models/Milestone.js';
import Project from '../models/Project.js';
import DocumentModel from '../models/Document.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { round } from '../services/money.js';
import { id, nonEmptyString, optionalString, nonNegativeNumber, optionalIsoDate, enumValue } from '../services/validate.js';
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
  optionalIsoDate(req.body?.completionDate, 'completionDate');
  const docs = Array.isArray(req.body?.verificationDocs) ? req.body.verificationDocs : [];

  const doc = await Milestone.create({
    projectId,
    title: nonEmptyString(req.body?.title, 'title'),
    description: optionalString(req.body?.description),
    targetDate: req.body?.targetDate || '',
    completionDate: req.body?.completionDate || '',
    gpsNotes: optionalString(req.body?.gpsNotes),
    verificationNotes: optionalString(req.body?.verificationNotes),
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
  if (req.body?.completionDate !== undefined) { optionalIsoDate(req.body.completionDate, 'completionDate'); update.completionDate = req.body.completionDate || ''; }
  if (req.body?.gpsNotes !== undefined) update.gpsNotes = optionalString(req.body.gpsNotes);
  if (req.body?.verificationNotes !== undefined) update.verificationNotes = optionalString(req.body.verificationNotes);
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

// Attach an already-uploaded managed document (see /api/documents) to a
// milestone as evidence. kind 'photo' files it under photos, otherwise documents.
// Site Photos category defaults to a photo when kind is omitted.
r.post('/:id/attach', asyncH(async (req, res) => {
  const milestone = await Milestone.findById(req.params.id);
  if (!milestone) return res.status(404).json({ error: 'milestone not found' });

  const documentId = id(req.body?.documentId, 'documentId');
  const document = await DocumentModel.findById(documentId);
  if (!document) return res.status(404).json({ error: 'document not found' });

  let kind = req.body?.kind;
  if (kind === undefined) kind = document.category === 'Site Photos' ? 'photo' : 'document';
  enumValue(kind, ['photo', 'document'], 'kind');

  const ref = { documentId: document._id, title: document.title, fileName: document.fileName };
  const list = kind === 'photo' ? 'photos' : 'documents';
  if (!milestone[list].some(d => d.documentId === document._id)) {
    milestone[list].push(ref);
    await milestone.save();
  }

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.UPDATE_MILESTONE,
    entityType: EntityTypes.MILESTONE,
    entityId: milestone._id.toString(),
    description: `Evidence attached to milestone "${milestone.title}" (${kind})`,
    status: ActivityStatus.SUCCESS,
    metadata: { documentId: document._id, kind }
  });

  res.json(milestone.toJSON());
}));

// Detach a previously attached evidence reference.
r.post('/:id/detach', asyncH(async (req, res) => {
  const milestone = await Milestone.findById(req.params.id);
  if (!milestone) return res.status(404).json({ error: 'milestone not found' });
  const documentId = id(req.body?.documentId, 'documentId');
  milestone.documents = milestone.documents.filter(d => d.documentId !== documentId);
  milestone.photos = milestone.photos.filter(d => d.documentId !== documentId);
  await milestone.save();
  res.json(milestone.toJSON());
}));

r.post('/:id/approve', asyncH((req, res) => decide(req, res, 'approved', ActivityTypes.MILESTONE_APPROVED)));
r.post('/:id/reject', asyncH((req, res) => decide(req, res, 'rejected', ActivityTypes.MILESTONE_REJECTED)));

export default r;
