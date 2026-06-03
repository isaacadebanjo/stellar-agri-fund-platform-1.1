import { Router } from 'express';
import ApprovalRequest from '../models/ApprovalRequest.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { paginate, listResponse } from '../services/pagination.js';
import { round } from '../services/money.js';
import { optionalString } from '../services/validate.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

// Segregation of duties: by default an admin may approve their own request
// (single-admin deployments). Set GOVERNANCE_ALLOW_SELF_APPROVE=false to require
// a different approver than the submitter.
const allowSelfApprove = () => process.env.GOVERNANCE_ALLOW_SELF_APPROVE !== 'false';

r.get('/pending', asyncH(async (req, res) => {
  const rows = await ApprovalRequest.find({ status: 'pending' }).sort({ createdAt: -1 });
  res.json(rows.map(x => x.toJSON()));
}));

// Approval dashboard: status + action-type breakdowns, throughput, and the
// average time-to-decision SLA. Powers the governance dashboard cards/charts.
r.get('/dashboard', asyncH(async (req, res) => {
  const [byStatus, byAction, decided, pendingOldest] = await Promise.all([
    ApprovalRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ApprovalRequest.aggregate([{ $group: { _id: '$actionType', count: { $sum: 1 } } }]),
    ApprovalRequest.find({ status: { $in: ['approved', 'rejected'] }, decisionAt: { $ne: null } })
      .select('createdAt decisionAt status').lean(),
    ApprovalRequest.findOne({ status: 'pending' }).sort({ createdAt: 1 }).select('createdAt').lean()
  ]);

  const statusCounts = Object.fromEntries(byStatus.map(s => [s._id, s.count]));
  const pending = statusCounts.pending || 0;
  const approved = statusCounts.approved || 0;
  const rejected = statusCounts.rejected || 0;
  const total = pending + approved + rejected;

  // Average hours from submission to decision, and approval rate.
  let avgDecisionHours = 0;
  if (decided.length) {
    const totalMs = decided.reduce((acc, d) => acc + (new Date(d.decisionAt) - new Date(d.createdAt)), 0);
    avgDecisionHours = round((totalMs / decided.length) / 3_600_000);
  }
  const decidedCount = approved + rejected;
  const approvalRate = decidedCount > 0 ? round((approved / decidedCount) * 100) : 0;
  const oldestPendingHours = pendingOldest
    ? round((Date.now() - new Date(pendingOldest.createdAt)) / 3_600_000)
    : 0;

  res.json({
    total,
    pending,
    approved,
    rejected,
    approvalRate,
    avgDecisionHours,
    oldestPendingHours,
    byAction: Object.fromEntries(byAction.map(a => [a._id, a.count]))
  });
}));

// Decided requests (approved/rejected) — the audit history, paginated.
r.get('/history', asyncH(async (req, res) => {
  const filter = { status: { $in: ['approved', 'rejected'] } };
  if (req.query.actionType) filter.actionType = req.query.actionType;
  const pg = paginate(req.query);
  const cursor = ApprovalRequest.find(filter).sort({ decisionAt: -1, createdAt: -1 });
  if (pg) cursor.skip(pg.skip).limit(pg.limit);
  const [rows, total] = await Promise.all([
    cursor,
    pg ? ApprovalRequest.countDocuments(filter) : Promise.resolve(0)
  ]);
  const data = rows.map(x => x.toJSON());
  res.json(pg ? listResponse(data, total, pg) : data);
}));

r.get('/', asyncH(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.actionType) filter.actionType = req.query.actionType;

  const pg = paginate(req.query);
  const cursor = ApprovalRequest.find(filter).sort({ createdAt: -1 });
  if (pg) cursor.skip(pg.skip).limit(pg.limit);
  const [rows, total] = await Promise.all([
    cursor,
    pg ? ApprovalRequest.countDocuments(filter) : Promise.resolve(0)
  ]);
  const data = rows.map(x => x.toJSON());
  res.json(pg ? listResponse(data, total, pg) : data);
}));

r.post('/:id/approve', asyncH(async (req, res) => {
  const reqDoc = await ApprovalRequest.findById(req.params.id);
  if (!reqDoc) return res.status(404).json({ error: 'approval request not found' });
  if (reqDoc.status !== 'pending') return res.status(409).json({ error: `request is already ${reqDoc.status}` });
  if (!allowSelfApprove() && reqDoc.submittedBy && reqDoc.submittedBy === req.user?.id) {
    return res.status(403).json({ error: 'A different admin must approve this request (segregation of duties).' });
  }

  reqDoc.status = 'approved';
  reqDoc.approvedBy = req.user?.id || null;
  reqDoc.decisionAt = new Date();
  reqDoc.comments = optionalString(req.body?.comments);
  await reqDoc.save();

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.APPROVAL_APPROVED,
    entityType: EntityTypes.APPROVAL,
    entityId: reqDoc._id.toString(),
    description: `Approved: ${reqDoc.summary}`,
    status: ActivityStatus.SUCCESS,
    metadata: { actionType: reqDoc.actionType, amount: reqDoc.amount, ref: reqDoc.ref }
  });

  res.json(reqDoc.toJSON());
}));

r.post('/:id/reject', asyncH(async (req, res) => {
  const reqDoc = await ApprovalRequest.findById(req.params.id);
  if (!reqDoc) return res.status(404).json({ error: 'approval request not found' });
  if (reqDoc.status !== 'pending') return res.status(409).json({ error: `request is already ${reqDoc.status}` });

  reqDoc.status = 'rejected';
  reqDoc.approvedBy = req.user?.id || null;
  reqDoc.decisionAt = new Date();
  reqDoc.comments = optionalString(req.body?.comments);
  await reqDoc.save();

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.APPROVAL_REJECTED,
    entityType: EntityTypes.APPROVAL,
    entityId: reqDoc._id.toString(),
    description: `Rejected: ${reqDoc.summary}`,
    status: ActivityStatus.SUCCESS,
    metadata: { actionType: reqDoc.actionType, ref: reqDoc.ref }
  });

  res.json(reqDoc.toJSON());
}));

export default r;
