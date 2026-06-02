import { Router } from 'express';
import Invoice from '../models/Invoice.js';
import Buyer from '../models/Buyer.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { paginate, listResponse } from '../services/pagination.js';
import { round, sum } from '../services/money.js';
import { id, optionalString, nonNegativeNumber, optionalIsoDate } from '../services/validate.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

const DAY = 24 * 60 * 60 * 1000;
const today = () => new Date(new Date().toISOString().slice(0, 10));

// Whole days between two ISO date strings (b - a). null if either is missing.
function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / DAY);
}

// Derive status from amounts.
function statusFor(amountDue, amountPaid) {
  if (amountPaid >= amountDue && amountDue > 0) return 'paid';
  if (amountPaid > 0) return 'partial';
  return 'unpaid';
}

// Days an invoice has been outstanding, and whether it's overdue.
function ageInfo(inv) {
  const paid = inv.status === 'paid';
  const end = paid && inv.paidDate ? inv.paidDate : new Date().toISOString().slice(0, 10);
  const daysOutstanding = inv.issuedDate ? daysBetween(inv.issuedDate, end) : null;
  const overdue = !paid && inv.dueDate ? new Date(inv.dueDate) < today() : false;
  return { daysOutstanding, overdue };
}

async function withBuyer(rows) {
  const buyerIds = [...new Set(rows.map(i => i.buyerId))];
  const buyers = await Buyer.find({ _id: { $in: buyerIds } }).lean();
  const buyerName = new Map(buyers.map(b => [b._id, b.name]));
  return rows.map(i => ({ ...i, buyerName: buyerName.get(i.buyerId) || 'Unknown', ...ageInfo(i) }));
}

// Dashboard: overdue alerts, average payment cycle, cash-conversion metrics.
r.get('/summary', asyncH(async (req, res) => {
  const invoices = await Invoice.find().lean();
  const totalBilled = sum(invoices, i => i.amountDue);
  const totalCollected = sum(invoices, i => i.amountPaid);

  const paid = invoices.filter(i => i.status === 'paid');
  const cycles = paid.map(i => daysBetween(i.issuedDate, i.paidDate)).filter(d => d !== null);
  const avgPaymentCycleDays = cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : 0;

  const overdue = invoices.filter(i => ageInfo(i).overdue);

  res.json({
    totalInvoices: invoices.length,
    totalBilled,
    totalCollected,
    outstandingAmount: round(Math.max(0, totalBilled - totalCollected)),
    collectionRatePercent: totalBilled > 0 ? round((totalCollected / totalBilled) * 100) : 0,
    overdueCount: overdue.length,
    overdueAmount: sum(overdue, i => round(i.amountDue - i.amountPaid)),
    avgPaymentCycleDays
  });
}));

r.get('/', asyncH(async (req, res) => {
  const filter = {};
  if (req.query.buyerId) filter.buyerId = req.query.buyerId;
  if (req.query.status) filter.status = req.query.status;

  const pg = paginate(req.query);
  const cursor = Invoice.find(filter).sort({ createdAt: -1 });
  if (pg) cursor.skip(pg.skip).limit(pg.limit);
  const [docs, total] = await Promise.all([
    cursor.lean(),
    pg ? Invoice.countDocuments(filter) : Promise.resolve(0)
  ]);
  const rows = await withBuyer(docs.map(d => ({ id: d._id, ...d, _id: undefined })));
  res.json(pg ? listResponse(rows, total, pg) : rows);
}));

r.post('/', asyncH(async (req, res) => {
  const buyerId = id(req.body?.buyerId, 'buyerId');
  const amountDue = nonNegativeNumber(req.body?.amountDue, 'amountDue');
  const amountPaid = req.body?.amountPaid === undefined ? 0 : nonNegativeNumber(req.body.amountPaid, 'amountPaid');
  if (!(await Buyer.findById(buyerId))) return res.status(404).json({ error: 'buyer not found' });
  optionalIsoDate(req.body?.issuedDate, 'issuedDate');
  optionalIsoDate(req.body?.dueDate, 'dueDate');
  optionalIsoDate(req.body?.paidDate, 'paidDate');

  const number = optionalString(req.body?.number) || 'INV-' + Math.random().toString(36).slice(2, 8).toUpperCase();

  const doc = await Invoice.create({
    number,
    buyerId,
    deliveryId: req.body?.deliveryId || null,
    offtakeId: req.body?.offtakeId || null,
    issuedDate: req.body?.issuedDate || new Date().toISOString().slice(0, 10),
    dueDate: req.body?.dueDate || '',
    paidDate: req.body?.paidDate || '',
    amountDue,
    amountPaid,
    status: statusFor(amountDue, amountPaid)
  });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.CREATE_INVOICE,
    entityType: EntityTypes.INVOICE,
    entityId: doc._id.toString(),
    description: `Invoice ${doc.number} issued (${doc.amountDue} due)`,
    status: ActivityStatus.SUCCESS,
    metadata: { number: doc.number, buyerId, amountDue }
  });

  const [enriched] = await withBuyer([{ id: doc._id, ...doc.toObject(), _id: undefined }]);
  res.status(201).json(enriched);
}));

// Record a payment (or edit amounts/dates). Recomputes status.
r.patch('/:id', asyncH(async (req, res) => {
  const existing = await Invoice.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'invoice not found' });

  const update = {};
  if (req.body?.amountDue !== undefined) update.amountDue = nonNegativeNumber(req.body.amountDue, 'amountDue');
  if (req.body?.amountPaid !== undefined) update.amountPaid = nonNegativeNumber(req.body.amountPaid, 'amountPaid');
  if (req.body?.dueDate !== undefined) { optionalIsoDate(req.body.dueDate, 'dueDate'); update.dueDate = req.body.dueDate || ''; }
  if (req.body?.paidDate !== undefined) { optionalIsoDate(req.body.paidDate, 'paidDate'); update.paidDate = req.body.paidDate || ''; }

  const amountDue = update.amountDue ?? existing.amountDue;
  const amountPaid = update.amountPaid ?? existing.amountPaid;
  update.status = statusFor(amountDue, amountPaid);
  // Auto-stamp the paid date when an invoice becomes fully paid and none given.
  if (update.status === 'paid' && !update.paidDate && !existing.paidDate) {
    update.paidDate = new Date().toISOString().slice(0, 10);
  }

  const doc = await Invoice.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.RECORD_PAYMENT,
    entityType: EntityTypes.INVOICE,
    entityId: doc._id.toString(),
    description: `Invoice ${doc.number} updated — status ${doc.status} (${doc.amountPaid}/${doc.amountDue})`,
    status: ActivityStatus.SUCCESS,
    metadata: { number: doc.number, status: doc.status, amountPaid: doc.amountPaid }
  });

  const [enriched] = await withBuyer([{ id: doc._id, ...doc.toObject(), _id: undefined }]);
  res.json(enriched);
}));

export default r;
