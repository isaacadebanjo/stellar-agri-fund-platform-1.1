import { Router } from 'express';
import Delivery, { DELIVERY_PAYMENT_STATUSES } from '../models/Delivery.js';
import OfftakeAgreement from '../models/OfftakeAgreement.js';
import Buyer from '../models/Buyer.js';
import Project from '../models/Project.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { paginate, listResponse } from '../services/pagination.js';
import { round, mul, sum } from '../services/money.js';
import { id, optionalString, nonNegativeNumber, enumValue, optionalIsoDate } from '../services/validate.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

async function withNames(rows) {
  const buyerIds = [...new Set(rows.map(d => d.buyerId))];
  const projectIds = [...new Set(rows.map(d => d.projectId).filter(Boolean))];
  const [buyers, projects] = await Promise.all([
    Buyer.find({ _id: { $in: buyerIds } }).lean(),
    Project.find({ _id: { $in: projectIds } }).lean()
  ]);
  const buyerName = new Map(buyers.map(b => [b._id, b.name]));
  const projectName = new Map(projects.map(p => [p._id, p.name]));
  return rows.map(d => ({
    ...d,
    buyerName: buyerName.get(d.buyerId) || 'Unknown',
    projectName: d.projectId ? (projectName.get(d.projectId) || 'Unknown') : '—'
  }));
}

// Dashboard: delivered vs contracted, outstanding deliveries, revenue generated.
r.get('/summary', asyncH(async (req, res) => {
  const [deliveries, contracts] = await Promise.all([
    Delivery.find().lean(),
    OfftakeAgreement.find({ status: { $in: ['active', 'completed'] } }).lean()
  ]);
  const deliveredVolume = sum(deliveries, d => d.quantityDelivered);
  const contractedVolume = sum(contracts, c => c.quantityCommitted);
  const revenueGenerated = sum(deliveries, d => d.invoiceAmount);
  const revenueCollected = sum(deliveries.filter(d => d.paymentStatus === 'paid'), d => d.invoiceAmount);
  const outstanding = deliveries.filter(d => d.paymentStatus !== 'paid');

  res.json({
    totalDeliveries: deliveries.length,
    deliveredVolume,
    contractedVolume,
    deliveredVsContractedPercent: contractedVolume > 0 ? round((deliveredVolume / contractedVolume) * 100) : 0,
    outstandingDeliveries: outstanding.length,
    outstandingValue: sum(outstanding, d => d.invoiceAmount),
    revenueGenerated,
    revenueCollected
  });
}));

r.get('/', asyncH(async (req, res) => {
  const filter = {};
  if (req.query.buyerId) filter.buyerId = req.query.buyerId;
  if (req.query.projectId) filter.projectId = req.query.projectId;
  if (req.query.offtakeId) filter.offtakeId = req.query.offtakeId;
  if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;

  const pg = paginate(req.query);
  const cursor = Delivery.find(filter).sort({ createdAt: -1 });
  if (pg) cursor.skip(pg.skip).limit(pg.limit);
  const [docs, total] = await Promise.all([
    cursor.lean(),
    pg ? Delivery.countDocuments(filter) : Promise.resolve(0)
  ]);
  const rows = await withNames(docs.map(d => ({ id: d._id, ...d, _id: undefined })));
  res.json(pg ? listResponse(rows, total, pg) : rows);
}));

r.post('/', asyncH(async (req, res) => {
  const buyerId = id(req.body?.buyerId, 'buyerId');
  const quantityDelivered = nonNegativeNumber(req.body?.quantityDelivered, 'quantityDelivered');
  const unitPrice = nonNegativeNumber(req.body?.unitPrice, 'unitPrice');
  if (!(await Buyer.findById(buyerId))) return res.status(404).json({ error: 'buyer not found' });
  optionalIsoDate(req.body?.deliveryDate, 'deliveryDate');

  const doc = await Delivery.create({
    harvestBatch: optionalString(req.body?.harvestBatch),
    deliveryDate: req.body?.deliveryDate || '',
    buyerId,
    offtakeId: req.body?.offtakeId || null,
    projectId: req.body?.projectId || null,
    quantityDelivered,
    unit: optionalString(req.body?.unit) || 'kg',
    unitPrice,
    invoiceAmount: mul(quantityDelivered, unitPrice),
    paymentStatus: req.body?.paymentStatus
      ? enumValue(req.body.paymentStatus, DELIVERY_PAYMENT_STATUSES, 'paymentStatus')
      : 'pending'
  });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.RECORD_DELIVERY,
    entityType: EntityTypes.DELIVERY,
    entityId: doc._id.toString(),
    description: `Delivery of ${doc.quantityDelivered} ${doc.unit} recorded (${doc.invoiceAmount} value)`,
    status: ActivityStatus.SUCCESS,
    metadata: { buyerId, quantityDelivered, invoiceAmount: doc.invoiceAmount }
  });

  const [enriched] = await withNames([{ id: doc._id, ...doc.toObject(), _id: undefined }]);
  res.status(201).json(enriched);
}));

r.patch('/:id', asyncH(async (req, res) => {
  const existing = await Delivery.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'delivery not found' });

  const update = {};
  if (req.body?.harvestBatch !== undefined) update.harvestBatch = optionalString(req.body.harvestBatch);
  if (req.body?.deliveryDate !== undefined) { optionalIsoDate(req.body.deliveryDate, 'deliveryDate'); update.deliveryDate = req.body.deliveryDate || ''; }
  if (req.body?.quantityDelivered !== undefined) update.quantityDelivered = nonNegativeNumber(req.body.quantityDelivered, 'quantityDelivered');
  if (req.body?.unitPrice !== undefined) update.unitPrice = nonNegativeNumber(req.body.unitPrice, 'unitPrice');
  if (req.body?.unit !== undefined) update.unit = optionalString(req.body.unit) || 'kg';
  if (req.body?.paymentStatus !== undefined) update.paymentStatus = enumValue(req.body.paymentStatus, DELIVERY_PAYMENT_STATUSES, 'paymentStatus');

  const qty = update.quantityDelivered ?? existing.quantityDelivered;
  const price = update.unitPrice ?? existing.unitPrice;
  update.invoiceAmount = mul(qty, price);

  const doc = await Delivery.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.UPDATE_DELIVERY,
    entityType: EntityTypes.DELIVERY,
    entityId: doc._id.toString(),
    description: `Delivery updated (${doc.quantityDelivered} ${doc.unit})`,
    status: ActivityStatus.SUCCESS,
    metadata: { updatedFields: Object.keys(update) }
  });

  const [enriched] = await withNames([{ id: doc._id, ...doc.toObject(), _id: undefined }]);
  res.json(enriched);
}));

export default r;
