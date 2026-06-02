import ApprovalRequest from '../models/ApprovalRequest.js';
import Project from '../models/Project.js';
import Milestone from '../models/Milestone.js';
import { asyncH } from '../routes/_async.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

// Governance is OPT-IN via env. With none of these set, every gate is a no-op
// and the money routes behave exactly as before.
const num = (name) => {
  const v = process.env[name];
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const flag = (name) => process.env[name] === 'true';

// Core gate. `extract(req)` returns { gated, amount, ref, key, summary, actionType }.
// - not gated            → next() (unchanged behavior)
// - approved + unconsumed → consume it, next() (execute the action)
// - pending exists        → 202 "awaiting approval"
// - otherwise             → create pending, 202 "submitted for approval"
function governanceGate(extract) {
  return asyncH(async (req, res, next) => {
    const info = extract(req);
    if (!info || !info.gated) return next();

    const { key, actionType, amount = 0, ref = '', summary = '' } = info;

    // Atomically consume an approved request so an approval can't be reused.
    const approved = await ApprovalRequest.findOneAndUpdate(
      { key, status: 'approved', consumedAt: null },
      { consumedAt: new Date() },
      { returnDocument: 'after' }
    );
    if (approved) return next();

    const pending = await ApprovalRequest.findOne({ key, status: 'pending' });
    if (pending) {
      return res.status(202).json({
        pendingApproval: true, approvalId: pending._id,
        message: 'This action is awaiting governance approval.'
      });
    }

    const created = await ApprovalRequest.create({
      key, actionType, amount, ref, summary, payload: req.body, submittedBy: req.user?.id
    });
    logActivity({
      userId: req.user?.id,
      userRole: req.user?.role || 'system',
      actionType: ActivityTypes.APPROVAL_SUBMITTED,
      entityType: EntityTypes.APPROVAL,
      entityId: created._id.toString(),
      description: `Approval requested: ${summary}`,
      status: ActivityStatus.PENDING,
      metadata: { actionType, amount, ref }
    });
    return res.status(202).json({
      pendingApproval: true, approvalId: created._id,
      message: 'Submitted for governance approval. An approver must approve it, then run the action again.'
    });
  });
}

// Large treasury allocations.
export const allocationGate = governanceGate((req) => {
  const amount = Number(req.body?.amount);
  const threshold = num('GOVERNANCE_ALLOCATION_THRESHOLD');
  const ref = req.body?.projectId || '';
  return {
    gated: threshold != null && amount > threshold,
    actionType: 'allocation', amount, ref,
    key: `allocation:${ref}:${amount}`,
    summary: `Allocate ${amount} XLM to project ${ref}`
  };
});

// Large farmer payouts.
export const payoutGate = governanceGate((req) => {
  const amount = Number(req.body?.amount);
  const threshold = num('GOVERNANCE_PAYOUT_THRESHOLD');
  const ref = req.body?.farmerId || '';
  return {
    gated: threshold != null && amount > threshold,
    actionType: 'payout', amount, ref,
    key: `payout:${req.body?.projectId || ''}:${ref}:${amount}`,
    summary: `Pay out ${amount} XLM to farmer ${ref}`
  };
});

// Distribution runs (flag-gated — any run requires approval when enabled).
export const distributionGate = governanceGate((req) => {
  const ref = req.body?.projectId || '';
  return {
    gated: flag('GOVERNANCE_DISTRIBUTION_REQUIRES_APPROVAL'),
    actionType: 'distribution', amount: 0, ref,
    key: `distribution:${ref}:${req.body?.periodStart || ''}:${req.body?.periodEnd || ''}`,
    summary: `Generate distributions for project ${ref}`
  };
});

// Project closure (flag-gated — only when status moves to completed/cancelled).
export const closureGate = governanceGate((req) => {
  const status = req.body?.status;
  const closing = status === 'completed' || status === 'cancelled';
  const ref = req.params?.id || '';
  return {
    gated: closing && flag('GOVERNANCE_PROJECT_CLOSURE_REQUIRES_APPROVAL'),
    actionType: 'project_closure', amount: 0, ref,
    key: `project_closure:${ref}:${status}`,
    summary: `Close project ${ref} (status → ${status})`
  };
});

// Milestone-based capital release: when a project has governanceEnabled, cap
// total allocations at the sum of approved milestones' releaseAmount.
export const milestoneAllocationGate = asyncH(async (req, res, next) => {
  const projectId = req.body?.projectId;
  const amount = Number(req.body?.amount);
  if (!projectId || !(amount > 0)) return next(); // let the handler validate

  const project = await Project.findById(projectId);
  if (!project || !project.governanceEnabled) return next(); // gating off

  const agg = await Milestone.aggregate([
    { $match: { projectId, approvalStatus: 'approved' } },
    { $group: { _id: null, total: { $sum: '$releaseAmount' } } }
  ]);
  const approvedRelease = agg[0]?.total || 0;
  if (project.allocated + amount > approvedRelease + 1e-9) {
    return res.status(403).json({
      error: `Allocation exceeds approved milestone release budget (${approvedRelease} XLM). Approve a milestone first.`
    });
  }
  next();
});
