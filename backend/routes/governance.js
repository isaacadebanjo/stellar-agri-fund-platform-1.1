import { Router } from 'express';
import ApprovalRequest from '../models/ApprovalRequest.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { paginate, listResponse } from '../services/pagination.js';
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
