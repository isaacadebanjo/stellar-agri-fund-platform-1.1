import mongoose from 'mongoose';
import { baseSchemaOptions } from './_base.js';

// Action types enum for consistency
export const ActivityTypes = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  CREATE_WALLET: 'CREATE_WALLET',
  CREATE_INVESTOR: 'CREATE_INVESTOR',
  CREATE_PROJECT: 'CREATE_PROJECT',
  FUND_WALLET: 'FUND_WALLET',
  INVESTMENT: 'INVESTMENT', // investor → treasury
  ALLOCATION: 'ALLOCATION', // treasury → project
  PAYOUT: 'PAYOUT',
  REVENUE_ENTRY: 'REVENUE_ENTRY',
  DISTRIBUTION_GENERATED: 'DISTRIBUTION_GENERATED',
  DISTRIBUTION_PAID: 'DISTRIBUTION_PAID',
  UPDATE_PROJECT: 'UPDATE_PROJECT',
  CREATE_FARMER: 'CREATE_FARMER',
  DELETE_FARMER: 'DELETE_FARMER',
  STATEMENT_GENERATED: 'STATEMENT_GENERATED',
  VIEW_TREASURY_REPORT: 'VIEW_TREASURY_REPORT',
  // Institutional Readiness — Commercial (Phase 1).
  CREATE_BUYER: 'CREATE_BUYER',
  UPDATE_BUYER: 'UPDATE_BUYER',
  ARCHIVE_BUYER: 'ARCHIVE_BUYER',
  CREATE_OFFTAKE: 'CREATE_OFFTAKE',
  UPDATE_OFFTAKE: 'UPDATE_OFFTAKE',
  RECORD_DELIVERY: 'RECORD_DELIVERY',
  UPDATE_DELIVERY: 'UPDATE_DELIVERY',
  CREATE_INVOICE: 'CREATE_INVOICE',
  RECORD_PAYMENT: 'RECORD_PAYMENT',
  // Institutional Readiness — Analytics (Phase 2).
  RECORD_YIELD: 'RECORD_YIELD',
  UPDATE_YIELD: 'UPDATE_YIELD',
  // Institutional Readiness — Governance (Phase 3).
  APPROVAL_SUBMITTED: 'APPROVAL_SUBMITTED',
  APPROVAL_APPROVED: 'APPROVAL_APPROVED',
  APPROVAL_REJECTED: 'APPROVAL_REJECTED',
  CREATE_MILESTONE: 'CREATE_MILESTONE',
  UPDATE_MILESTONE: 'UPDATE_MILESTONE',
  MILESTONE_APPROVED: 'MILESTONE_APPROVED',
  MILESTONE_REJECTED: 'MILESTONE_REJECTED',
  // Institutional-grade upgrade — Document Management.
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  DOCUMENT_VERSIONED: 'DOCUMENT_VERSIONED',
  DOCUMENT_ARCHIVED: 'DOCUMENT_ARCHIVED',
  DOCUMENT_DOWNLOADED: 'DOCUMENT_DOWNLOADED',
  // Institutional-grade upgrade — Board & Investor Reporting.
  REPORT_GENERATED: 'REPORT_GENERATED'
};

// Entity types
export const EntityTypes = {
  WALLET: 'WALLET',
  INVESTOR: 'INVESTOR',
  PROJECT: 'PROJECT',
  TRANSACTION: 'TRANSACTION',
  PAYOUT: 'PAYOUT',
  REVENUE: 'REVENUE',
  DISTRIBUTION: 'DISTRIBUTION',
  FARMER: 'FARMER',
  REPORT: 'REPORT',
  SYSTEM: 'SYSTEM',
  BUYER: 'BUYER',
  OFFTAKE: 'OFFTAKE',
  DELIVERY: 'DELIVERY',
  INVOICE: 'INVOICE',
  YIELD: 'YIELD',
  APPROVAL: 'APPROVAL',
  MILESTONE: 'MILESTONE',
  DOCUMENT: 'DOCUMENT'
};

// Status enum
export const ActivityStatus = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  PENDING: 'PENDING'
};

const schema = new mongoose.Schema(
  {
    userId: {
      type: String,
      default: null
    },
    userRole: {
      type: String,
      enum: ['admin', 'investor', 'farmer', 'system'],
      default: 'system'
    },
    actionType: {
      type: String,
      enum: Object.values(ActivityTypes),
      required: true,
      index: true
    },
    entityType: {
      type: String,
      enum: Object.values(EntityTypes),
      required: true,
      index: true
    },
    entityId: {
      type: String,
      required: true,
      index: true
    },
    description: {
      type: String,
      required: true
    },
    txHash: {
      type: String,
      default: null,
      sparse: true,
      index: true
    },
    status: {
      type: String,
      enum: Object.values(ActivityStatus),
      default: ActivityStatus.SUCCESS,
      index: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  baseSchemaOptions()
);

// Create compound index for common queries
schema.index({ userId: 1, createdAt: -1 });
schema.index({ actionType: 1, createdAt: -1 });
schema.index({ userRole: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

export default mongoose.model('ActivityLog', schema);
