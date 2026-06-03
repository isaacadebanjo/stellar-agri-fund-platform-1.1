import { Router } from 'express';
import multer from 'multer';
import Document, { DOCUMENT_CATEGORIES, DOCUMENT_STATUSES } from '../models/Document.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { paginate, listResponse } from '../services/pagination.js';
import { nonEmptyString, optionalString, enumValue } from '../services/validate.js';
import * as storage from '../services/storage/index.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

// Multipart uploads are handled HERE (memory storage) — deliberately scoped to
// this router so the global express.json({ limit: '100kb' }) in server.js is
// never touched. Size cap is configurable via MAX_UPLOAD_MB (default 25).
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 25;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 }
});

// Build the related-id filter shared by list + count.
function buildFilter(query) {
  const filter = {};
  // Default to active documents unless an explicit status is requested.
  if (query.status === 'all') {
    // no status filter
  } else if (query.status) {
    filter.status = enumValue(query.status, DOCUMENT_STATUSES, 'status');
  } else {
    filter.status = 'active';
  }
  if (query.category) filter.category = enumValue(query.category, DOCUMENT_CATEGORIES, 'category');
  if (query.relatedProjectId) filter.relatedProjectId = query.relatedProjectId;
  if (query.relatedBuyerId) filter.relatedBuyerId = query.relatedBuyerId;
  if (query.relatedInvestorId) filter.relatedInvestorId = query.relatedInvestorId;
  if (query.investorVisible === 'true') filter.investorVisible = true;
  // Only the head of each version chain by default, so the list isn't cluttered
  // with superseded revisions. Pass latestOnly=false to see every version.
  if (query.latestOnly !== 'false') filter.isLatest = true;
  // Free-text search across title + description.
  const q = optionalString(query.q);
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: rx }, { description: rx }, { fileName: rx }];
  }
  return filter;
}

// Expose the category list so the frontend dropdown stays in sync with the model.
r.get('/categories', (req, res) => res.json({ categories: DOCUMENT_CATEGORIES }));

r.get('/', asyncH(async (req, res) => {
  const filter = buildFilter(req.query);
  const pg = paginate(req.query);
  const cursor = Document.find(filter).sort({ createdAt: -1 });
  if (pg) cursor.skip(pg.skip).limit(pg.limit);
  const [rows, total] = await Promise.all([
    cursor,
    pg ? Document.countDocuments(filter) : Promise.resolve(0)
  ]);
  const data = rows.map(d => d.toJSON());
  res.json(pg ? listResponse(data, total, pg) : data);
}));

r.get('/:id', asyncH(async (req, res) => {
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'document not found' });
  res.json(doc.toJSON());
}));

// All versions of a document, newest first (matched by shared rootId).
r.get('/:id/versions', asyncH(async (req, res) => {
  const doc = await Document.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ error: 'document not found' });
  const root = doc.rootId || doc._id;
  const versions = await Document.find({ $or: [{ _id: root }, { rootId: root }] })
    .sort({ version: -1 });
  res.json(versions.map(v => v.toJSON()));
}));

async function streamFile(req, res, disposition) {
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'document not found' });
  if (!(await storage.exists(doc.fileKey))) {
    return res.status(410).json({ error: 'file is no longer available' });
  }
  res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
  const safeName = (doc.fileName || doc.title || 'document').replace(/[^\w.\- ]+/g, '_');
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
  if (doc.fileSize) res.setHeader('Content-Length', doc.fileSize);

  if (disposition === 'attachment') {
    logActivity({
      userId: req.user?.id,
      userRole: req.user?.role || 'system',
      actionType: ActivityTypes.DOCUMENT_DOWNLOADED,
      entityType: EntityTypes.DOCUMENT,
      entityId: doc._id.toString(),
      description: `Document "${doc.title}" downloaded`,
      status: ActivityStatus.SUCCESS,
      metadata: { category: doc.category, version: doc.version }
    });
  }

  const stream = storage.getStream(doc.fileKey);
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).json({ error: 'failed to read file' });
    else res.destroy();
  });
  stream.pipe(res);
}

r.get('/:id/download', asyncH((req, res) => streamFile(req, res, 'attachment')));
r.get('/:id/preview', asyncH((req, res) => streamFile(req, res, 'inline')));

// Parse + validate the shared metadata fields from a multipart body.
function readMeta(body) {
  return {
    title: nonEmptyString(body?.title, 'title'),
    category: enumValue(body?.category, DOCUMENT_CATEGORIES, 'category'),
    description: optionalString(body?.description),
    relatedProjectId: optionalString(body?.relatedProjectId) || null,
    relatedBuyerId: optionalString(body?.relatedBuyerId) || null,
    relatedInvestorId: optionalString(body?.relatedInvestorId) || null,
    investorVisible: body?.investorVisible === 'true' || body?.investorVisible === true
  };
}

r.post('/', upload.single('file'), asyncH(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const meta = readMeta(req.body);

  const stored = await storage.save({
    buffer: req.file.buffer,
    fileName: req.file.originalname,
    mimeType: req.file.mimetype
  });

  const doc = await Document.create({
    ...meta,
    version: 1,
    isLatest: true,
    fileKey: stored.key,
    fileUrl: stored.url,
    fileName: req.file.originalname,
    fileSize: stored.size,
    mimeType: req.file.mimetype || 'application/octet-stream',
    uploadedBy: req.user?.id || null
  });
  // v1 is its own root.
  doc.rootId = doc._id;
  await doc.save();

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.DOCUMENT_UPLOADED,
    entityType: EntityTypes.DOCUMENT,
    entityId: doc._id.toString(),
    description: `Document "${doc.title}" uploaded (${doc.category})`,
    status: ActivityStatus.SUCCESS,
    metadata: { category: doc.category, fileSize: doc.fileSize }
  });

  res.status(201).json(doc.toJSON());
}));

// Upload a new version of an existing document. The previous version is demoted
// (isLatest=false) and the new one chains back to it via supersedesId.
r.post('/:id/version', upload.single('file'), asyncH(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const prev = await Document.findById(req.params.id);
  if (!prev) return res.status(404).json({ error: 'document not found' });

  // Resolve to the current head of the chain so versions stay linear even if an
  // older revision id was passed.
  const root = prev.rootId || prev._id;
  const head = await Document.findOne({ $or: [{ _id: root }, { rootId: root }] }).sort({ version: -1 });

  const stored = await storage.save({
    buffer: req.file.buffer,
    fileName: req.file.originalname,
    mimeType: req.file.mimetype
  });

  const doc = await Document.create({
    title: head.title,
    category: head.category,
    description: optionalString(req.body?.description) || head.description,
    relatedProjectId: head.relatedProjectId,
    relatedBuyerId: head.relatedBuyerId,
    relatedInvestorId: head.relatedInvestorId,
    investorVisible: head.investorVisible,
    version: head.version + 1,
    rootId: root,
    supersedesId: head._id,
    isLatest: true,
    fileKey: stored.key,
    fileUrl: stored.url,
    fileName: req.file.originalname,
    fileSize: stored.size,
    mimeType: req.file.mimetype || 'application/octet-stream',
    uploadedBy: req.user?.id || null
  });

  head.isLatest = false;
  await head.save();

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.DOCUMENT_VERSIONED,
    entityType: EntityTypes.DOCUMENT,
    entityId: doc._id.toString(),
    description: `Document "${doc.title}" updated to v${doc.version}`,
    status: ActivityStatus.SUCCESS,
    metadata: { category: doc.category, version: doc.version, supersedes: head._id }
  });

  res.status(201).json(doc.toJSON());
}));

r.post('/:id/archive', asyncH(async (req, res) => {
  const doc = await Document.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true });
  if (!doc) return res.status(404).json({ error: 'document not found' });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.DOCUMENT_ARCHIVED,
    entityType: EntityTypes.DOCUMENT,
    entityId: doc._id.toString(),
    description: `Document "${doc.title}" archived`,
    status: ActivityStatus.SUCCESS,
    metadata: { category: doc.category }
  });

  res.json(doc.toJSON());
}));

// Multer errors (e.g. file too large) arrive as a special error type — turn them
// into clean 400s instead of 500s.
r.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `upload failed: ${err.message}` });
  }
  next(err);
});

export default r;
