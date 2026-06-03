// Notification engine. Turns notable business events into persisted, audience-
// scoped Notification records and broadcasts a live 'notification' event over the
// existing SSE bus. Driven centrally off the activity log (see activityLog.js) so
// individual routes don't each have to remember to notify — every notable
// ActivityType automatically produces notifications.
import Notification from '../models/Notification.js';
import { broadcast } from './eventBus.js';
import { ActivityTypes } from '../models/ActivityLog.js';

// The subset of activity actions worth notifying on, with presentation metadata.
// `audience: 'both'` means an admin-wide notification AND a per-investor one
// (using metadata.investorIds when present).
const NOTABLE = {
  [ActivityTypes.INVESTMENT]: { title: 'Investment Received', level: 'success', audience: 'both' },
  [ActivityTypes.ALLOCATION]: { title: 'Funds Allocated', level: 'info', audience: 'admin' },
  [ActivityTypes.PAYOUT]: { title: 'Farmer Paid', level: 'info', audience: 'admin' },
  [ActivityTypes.REVENUE_ENTRY]: { title: 'Revenue Recorded', level: 'success', audience: 'admin' },
  [ActivityTypes.DISTRIBUTION_GENERATED]: { title: 'Distribution Generated', level: 'success', audience: 'both' },
  [ActivityTypes.DISTRIBUTION_PAID]: { title: 'Distribution Paid', level: 'success', audience: 'both' },
  [ActivityTypes.MILESTONE_APPROVED]: { title: 'Milestone Approved', level: 'success', audience: 'admin' },
  [ActivityTypes.APPROVAL_SUBMITTED]: { title: 'Approval Requested', level: 'warning', audience: 'admin' },
  [ActivityTypes.CONTRACT_EXPIRING]: { title: 'Contract Expiring', level: 'warning', audience: 'admin' }
};

function emit(doc) {
  broadcast({
    type: 'notification',
    notificationId: doc._id,
    audience: doc.audience,
    investorId: doc.investorId,
    userId: doc.userId,
    title: doc.title,
    message: doc.message,
    level: doc.level,
    // Reuse the eventBus investor-routing convention so investor notifications
    // only reach the right investor's live stream.
    metadata: doc.investorId ? { investorIds: [doc.investorId] } : null,
    ts: (doc.createdAt || new Date()).toISOString?.() || new Date().toISOString()
  });
}

// Create a single notification (persist + live broadcast). Exported so other
// code (e.g. a scheduled contract-expiry sweep) can create notifications too.
export async function createNotification(payload) {
  const doc = await Notification.create(payload);
  emit(doc);
  return doc;
}

// Build notifications from a freshly-created ActivityLog document. Fire-and-forget
// safe: callers don't await it on the request path.
export async function notifyFromActivity(activity) {
  const spec = NOTABLE[activity.actionType];
  if (!spec) return;

  const base = {
    type: activity.actionType,
    title: spec.title,
    message: activity.description || '',
    level: spec.level || 'info',
    entityType: activity.entityType || null,
    entityId: activity.entityId || null,
    metadata: activity.metadata || null
  };

  const jobs = [];
  if (spec.audience === 'admin' || spec.audience === 'both') {
    jobs.push(createNotification({ ...base, audience: 'admin' }));
  }
  if (spec.audience === 'investor' || spec.audience === 'both') {
    const investorIds = Array.isArray(activity.metadata?.investorIds) ? activity.metadata.investorIds : [];
    for (const investorId of investorIds) {
      jobs.push(createNotification({ ...base, audience: 'investor', investorId }));
    }
  }
  await Promise.allSettled(jobs);
}

// MongoDB filter limiting notifications to what a user may see.
export function visibilityFilter(user) {
  if (user.role === 'admin') return { audience: 'admin' };
  if (user.role === 'investor') {
    const ors = [{ audience: 'user', userId: user.id }];
    if (user.investorId) ors.push({ audience: 'investor', investorId: user.investorId });
    return { $or: ors };
  }
  return { _id: null }; // matches nothing
}

// Shape a notification for the API, adding a per-user `read` flag.
export function toApiNotification(doc, userId) {
  const obj = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  const readBy = obj.readBy || [];
  return {
    id: obj.id || obj._id,
    type: obj.type,
    title: obj.title,
    message: obj.message,
    level: obj.level,
    entityType: obj.entityType,
    entityId: obj.entityId,
    createdAt: obj.createdAt,
    read: readBy.includes(userId)
  };
}
