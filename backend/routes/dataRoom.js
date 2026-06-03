import { Router } from 'express';
import DocumentModel, { DOCUMENT_CATEGORIES } from '../models/Document.js';
import Investor from '../models/Investor.js';
import Project from '../models/Project.js';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import Distribution from '../models/Distribution.js';
import Revenue from '../models/Revenue.js';
import { asyncH } from './_async.js';
import { paginate, listResponse } from '../services/pagination.js';
import { optionalString } from '../services/validate.js';
import * as storage from '../services/storage/index.js';
import { round } from '../services/money.js';
import { generateInvestorStatementPDF } from '../services/pdfStatement.js';

const r = Router();
// NOTE: no requireRole here — the data room is the one place investors get read
// access. Global requireAuth (server.js) still applies. Every handler resolves a
// SCOPE so an investor only ever sees their own data; an admin sees everything,
// or a chosen investor via ?investorId=.

// Resolve the access scope for this request.
async function resolveScope(req) {
  const isAdmin = req.user?.role === 'admin';
  // Investors are pinned to their own investorId; admins may target one (or all).
  const investorId = isAdmin ? (req.query.investorId || null) : (req.user?.investorId || null);

  if (!isAdmin && !investorId) {
    const err = new Error('No investor profile is linked to this account.');
    err.httpStatus = 403;
    throw err;
  }

  let projectIds = [];
  let walletId = null;
  if (investorId) {
    const [investor, projIds] = await Promise.all([
      Investor.findById(investorId).lean(),
      Distribution.distinct('projectId', { investorId })
    ]);
    if (!investor && !isAdmin) {
      const err = new Error('Investor not found.');
      err.httpStatus = 404;
      throw err;
    }
    walletId = investor?.walletId || null;
    projectIds = projIds;
  }
  return { isAdmin, investorId, projectIds, walletId, viewingAll: isAdmin && !investorId };
}

// MongoDB filter limiting documents to what the scope may see.
function scopedDocFilter(scope, extra = {}) {
  const base = { status: 'active', ...extra };
  if (scope.viewingAll) return base; // admin, all investors
  const ors = [{ investorVisible: true }];
  if (scope.investorId) ors.push({ relatedInvestorId: scope.investorId });
  if (scope.projectIds.length) ors.push({ relatedProjectId: { $in: scope.projectIds } });
  return { ...base, $or: ors };
}

// The 10 named data-room sections. Document-backed sections map to a category;
// report-backed sections are generated on demand (statements / board reports).
const SECTIONS = [
  { key: 'investor-statements', title: 'Investor Statements', kind: 'report' },
  { key: 'treasury-reports', title: 'Treasury Reports', kind: 'report' },
  { key: 'project-reports', title: 'Project Reports', kind: 'report' },
  { key: 'kpi-reports', title: 'KPI Reports', kind: 'report' },
  { key: 'yield-reports', title: 'Yield Reports', kind: 'document', category: 'Yield Reports' },
  { key: 'financial-statements', title: 'Financial Statements', kind: 'document', category: 'Financial Statements' },
  { key: 'governance-documents', title: 'Governance Documents', kind: 'document', category: 'Governance Documents' },
  { key: 'offtake-agreements', title: 'Offtake Agreements', kind: 'document', category: 'Offtake Agreements' },
  { key: 'buyer-verification', title: 'Buyer Verification Documents', kind: 'document', category: 'Buyer Contracts' },
  { key: 'distribution-reports', title: 'Distribution Reports', kind: 'report' }
];

// Dashboard cards + section index.
r.get('/overview', asyncH(async (req, res) => {
  const scope = await resolveScope(req);

  // Financial cards — scoped to the investor, or platform-wide for admin/all.
  let totalInvestments = 0;
  let totalReturns = 0;
  let totalRevenue = 0;
  let activeProjects = 0;

  if (scope.viewingAll) {
    const [invAgg, distAgg, revAgg, projects] = await Promise.all([
      Transaction.aggregate([{ $match: { stage: 'investment', status: 'success' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Distribution.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
      Revenue.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
      Project.find({ status: 'active' }).lean()
    ]);
    totalInvestments = round(invAgg[0]?.total || 0);
    totalReturns = round(distAgg[0]?.total || 0);
    totalRevenue = round(revAgg[0]?.total || 0);
    activeProjects = projects.length;
  } else {
    const [invAgg, distAgg, revAgg, projects] = await Promise.all([
      scope.walletId
        ? Transaction.aggregate([{ $match: { stage: 'investment', status: 'success', senderId: scope.walletId } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
        : Promise.resolve([]),
      Distribution.aggregate([{ $match: { investorId: scope.investorId } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      scope.projectIds.length
        ? Revenue.aggregate([{ $match: { projectId: { $in: scope.projectIds } } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
        : Promise.resolve([]),
      scope.projectIds.length ? Project.find({ _id: { $in: scope.projectIds }, status: 'active' }).lean() : Promise.resolve([])
    ]);
    totalInvestments = round(invAgg[0]?.total || 0);
    totalReturns = round(distAgg[0]?.total || 0);
    totalRevenue = round(revAgg[0]?.total || 0);
    activeProjects = projects.length;
  }

  // Per-category document counts within scope.
  const docFilter = scopedDocFilter(scope);
  const docs = await DocumentModel.find(docFilter).select('category').lean();
  const countByCategory = {};
  for (const d of docs) countByCategory[d.category] = (countByCategory[d.category] || 0) + 1;
  const documentsAvailable = docs.length;

  // Build the section index. Document sections carry their scoped count; report
  // sections are always available to generate.
  const sections = SECTIONS.map(s => ({
    ...s,
    count: s.kind === 'document' ? (countByCategory[s.category] || 0) : null,
    available: s.kind === 'report' ? true : (countByCategory[s.category] || 0) > 0
  }));
  const reportsAvailable = sections.filter(s => s.kind === 'report').length;

  res.json({
    scope: { viewingAll: scope.viewingAll, investorId: scope.investorId },
    cards: {
      documentsAvailable,
      reportsGenerated: reportsAvailable,
      totalInvestments,
      activeProjects,
      totalRevenue,
      totalReturns
    },
    sections,
    categories: DOCUMENT_CATEGORIES
  });
}));

// Scoped document listing with category / search / date filters.
r.get('/documents', asyncH(async (req, res) => {
  const scope = await resolveScope(req);
  const extra = {};
  if (req.query.category) extra.category = req.query.category;
  const q = optionalString(req.query.q);
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    extra.$and = [{ $or: [{ title: rx }, { description: rx }, { fileName: rx }] }];
  }
  // Date range on createdAt.
  const createdAt = {};
  if (req.query.from) createdAt.$gte = new Date(req.query.from);
  if (req.query.to) createdAt.$lte = new Date(req.query.to);
  if (Object.keys(createdAt).length) extra.createdAt = createdAt;

  const filter = scopedDocFilter(scope, extra);
  const pg = paginate(req.query);
  const cursor = DocumentModel.find(filter).sort({ createdAt: -1 });
  if (pg) cursor.skip(pg.skip).limit(pg.limit);
  const [rows, total] = await Promise.all([
    cursor,
    pg ? DocumentModel.countDocuments(filter) : Promise.resolve(0)
  ]);
  const data = rows.map(d => d.toJSON());
  res.json(pg ? listResponse(data, total, pg) : data);
}));

// Scoped download / preview — re-checks visibility so an investor can't fetch a
// document by guessing its id.
async function streamScoped(req, res, disposition) {
  const scope = await resolveScope(req);
  const filter = scopedDocFilter(scope, { _id: req.params.id });
  const doc = await DocumentModel.findOne(filter);
  if (!doc) return res.status(404).json({ error: 'document not found' });
  if (!(await storage.exists(doc.fileKey))) return res.status(410).json({ error: 'file is no longer available' });
  res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
  const safeName = (doc.fileName || doc.title || 'document').replace(/[^\w.\- ]+/g, '_');
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
  const stream = storage.getStream(doc.fileKey);
  stream.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'failed to read file' }); else res.destroy(); });
  stream.pipe(res);
}
r.get('/documents/:id/download', asyncH((req, res) => streamScoped(req, res, 'attachment')));
r.get('/documents/:id/preview', asyncH((req, res) => streamScoped(req, res, 'inline')));

// Investor statement PDF for the scoped investor (investors get their own;
// admins can pass ?investorId=). Reuses the existing statement generator.
r.get('/statement/pdf', asyncH(async (req, res) => {
  const scope = await resolveScope(req);
  if (!scope.investorId) return res.status(400).json({ error: 'investorId required' });

  const investor = await Investor.findById(scope.investorId);
  if (!investor) return res.status(404).json({ error: 'investor not found' });
  const wallet = investor.walletId ? await Wallet.findById(investor.walletId) : null;
  const investments = wallet
    ? await Transaction.find({ stage: 'investment', senderId: wallet._id }).sort({ timestamp: -1 })
    : [];
  const distributions = await Distribution.find({ investorId: investor._id }).sort({ timestamp: -1 });
  const projectIds = Array.from(new Set(distributions.map(d => d.projectId)));
  const projects = await Project.find({ _id: { $in: projectIds } });

  const pdf = await generateInvestorStatementPDF({ investor, wallet, investmentTxs: investments, distributions, projects });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Statement-${(investor.name || 'investor').replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf"`);
  res.send(pdf);
}));

export default r;
