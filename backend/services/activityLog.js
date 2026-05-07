import ActivityLog, { ActivityTypes, EntityTypes, ActivityStatus } from '../models/ActivityLog.js';

/**
 * Centralized activity logging service.
 * All logs are created asynchronously to avoid blocking requests.
 *
 * @param {Object} params
 * @param {String} params.userId - (optional) User ID from JWT
 * @param {String} params.userRole - (optional) User role: admin|investor|farmer|system
 * @param {String} params.actionType - Action type from ActivityTypes enum
 * @param {String} params.entityType - Entity type from EntityTypes enum
 * @param {String} params.entityId - ID of the entity being acted upon
 * @param {String} params.description - Human-readable description of the action
 * @param {String} params.txHash - (optional) Stellar transaction hash
 * @param {String} params.status - (optional) SUCCESS|FAILED|PENDING (defaults to SUCCESS)
 * @param {Object} params.metadata - (optional) Extra context/data as plain object
 */
export async function logActivity({
  userId,
  userRole = 'system',
  actionType,
  entityType,
  entityId,
  description,
  txHash,
  status = ActivityStatus.SUCCESS,
  metadata
}) {
  try {
    // Fire and forget: don't wait for the log to be persisted
    setImmediate(async () => {
      try {
        await ActivityLog.create({
          userId: userId || null,
          userRole,
          actionType,
          entityType,
          entityId,
          description,
          txHash: txHash || null,
          status,
          metadata: metadata || null
        });
      } catch (err) {
        console.error('[ActivityLog] Failed to create log:', err.message);
      }
    });
  } catch (err) {
    console.error('[ActivityLog] Error in logActivity:', err.message);
  }
}

/**
 * Log activity synchronously (waits for DB write).
 * Use sparingly for critical audit events.
 */
export async function logActivitySync({
  userId,
  userRole = 'system',
  actionType,
  entityType,
  entityId,
  description,
  txHash,
  status = ActivityStatus.SUCCESS,
  metadata
}) {
  return ActivityLog.create({
    userId: userId || null,
    userRole,
    actionType,
    entityType,
    entityId,
    description,
    txHash: txHash || null,
    status,
    metadata: metadata || null
  });
}

export { ActivityTypes, EntityTypes, ActivityStatus };
