import mongoose from 'mongoose';
import { baseSchemaOptions, idField } from './_base.js';

// The 10 institutional document categories. Kept as a named export so routes,
// the data room, and the frontend can share one source of truth.
export const DOCUMENT_CATEGORIES = [
  'Offtake Agreements',
  'Buyer Contracts',
  'Purchase Orders',
  'Invoices',
  'Yield Reports',
  'Governance Documents',
  'Investor Reports',
  'Financial Statements',
  'Milestone Evidence',
  'Site Photos'
];

export const DOCUMENT_STATUSES = ['active', 'archived'];

// A managed document: metadata in MongoDB, the actual bytes in the storage
// abstraction (services/storage). Versions are chained — every version shares a
// `rootId` (the first version's id) and points at its immediate predecessor via
// `supersedesId`, so the full history of a document is one query on rootId.
const DocumentSchema = new mongoose.Schema({
  _id: idField(12),
  title: { type: String, required: true, trim: true },
  category: { type: String, enum: DOCUMENT_CATEGORIES, required: true, index: true },
  description: { type: String, default: '' },
  status: { type: String, enum: DOCUMENT_STATUSES, default: 'active', index: true },

  // Versioning.
  version: { type: Number, default: 1, min: 1 },
  rootId: { type: String, default: null, index: true },   // first version's id (set to own id on v1)
  supersedesId: { type: String, default: null },          // immediate previous version
  isLatest: { type: Boolean, default: true, index: true },

  // Stored file.
  fileKey: { type: String, required: true },
  fileUrl: { type: String, default: '' },                 // set by cloud adapters; '' for local
  fileName: { type: String, default: '' },
  fileSize: { type: Number, default: 0 },
  mimeType: { type: String, default: 'application/octet-stream' },

  uploadedBy: { type: String, default: null },

  // Relations (all optional). Let documents be filed against a project, buyer,
  // and/or investor for the data room and milestone evidence.
  relatedProjectId: { type: String, default: null, index: true },
  relatedBuyerId: { type: String, default: null, index: true },
  relatedInvestorId: { type: String, default: null, index: true },

  // When true, this document is visible to investors in the data room even if it
  // isn't tied to their own investorId/projects (e.g. governance + financials).
  investorVisible: { type: Boolean, default: false, index: true }
}, baseSchemaOptions(12));

// Free-text search over title + description.
DocumentSchema.index({ title: 'text', description: 'text' });
DocumentSchema.index({ category: 1, status: 1, createdAt: -1 });

export default mongoose.model('Document', DocumentSchema);
