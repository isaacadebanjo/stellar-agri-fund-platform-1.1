import { Router } from 'express';
import OfftakeAgreement, { OFFTAKE_STATUSES } from '../models/OfftakeAgreement.js';
import Delivery from '../models/Delivery.js';
import Buyer from '../models/Buyer.js';
import Project from '../models/Project.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { paginate, listResponse } from '../services/pagination.js';
import { round, mul, sum } from '../services/money.js';
import { nonEmptyString, id, optionalString, nonNegativeNumber, enumValue, optionalIsoDate } from '../services/validate.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

// Attach buyer + project names without N+1.
async function withNames(rows) {
  const buyerIds = [...new Set(rows.map(o => o.buyerId))];
  const projectIds = [...new Set(rows.map(o => o.projectId))];
  const [buyers, projects] = await Promise.all([
    Buyer.find({ _id: { $in: buyerIds } }).lean(),
    Project.find({ _id: { $in: projectIds } }).lean()
  ]);
  const buyerName = new Map(buyers.map(b => [b._id, b.name]));
  const projectName = new Map(projects.map(p => [p._id, p.name]));
  return rows.map(o => ({
    ...o,
    buyerName: buyerName.get(o.buyerId) || 'Unknown',
    projectName: projectName.get(o.projectId) || 'Unknown'
  }));
}

// Dashboard: total contracted revenue, contract utilization % (delivered value
// vs contracted value), remaining commitments (quantity).
r.get('/summary', asyncH(async (req, res) => {
  const contracts = await OfftakeAgreement.find({ status: { $in: ['active', 'completed'] } }).lean();
  const totalContractedRevenue = sum(contracts, c => c.contractValue);
  const totalContractedVolume = sum(contracts, c => c.quantityCommitted);

  const offtakeIds = contracts.map(c => c._id);
  const deliveries = await Delivery.find({ offtakeId: { $in: offtakeIds } }).lean();
  const deliveredValue = sum(deliveries, d => d.invoiceAmount);
  const deliveredVolume = sum(deliveries, d => d.quantityDelivered);

  const utilizationPercent = totalContractedRevenue > 0
    ? round((deliveredValue / totalContractedRevenue) * 100)
    : 0;

  res.json({
    activeContracts: contracts.length,
    totalContractedRevenue,
    totalContractedVolume,
    deliveredValue,
    remainingCommitmentValue: round(Math.max(0, totalContractedRevenue - deliveredValue)),
    remainingCommitmentVolume: round(Math.max(0, totalContractedVolume - deliveredVolume)),
    utilizationPercent
  });
}));

r.get('/', asyncH(async (req, res) => {
  const filter = {};
  if (req.query.buyerId) filter.buyerId = req.query.buyerId;
  if (req.query.projectId) filter.projectId = req.query.projectId;
  if (req.query.status) filter.status = req.query.status;

  const pg = paginate(req.query);
  const cursor = OfftakeAgreement.find(filter).sort({ createdAt: -1 });
  if (pg) cursor.skip(pg.skip).limit(pg.limit);
  const [docs, total] = await Promise.all([
    cursor.lean(),
    pg ? OfftakeAgreement.countDocuments(filter) : Promise.resolve(0)
  ]);
  const rows = await withNames(docs.map(d => ({ id: d._id, ...d, _id: undefined })));
  res.json(pg ? listResponse(rows, total, pg) : rows);
}));

r.post('/', asyncH(async (req, res) => {
  const agreementNumber = nonEmptyString(req.body?.agreementNumber, 'agreementNumber');
  const buyerId = id(req.body?.buyerId, 'buyerId');
  const projectId = id(req.body?.projectId, 'projectId');
  const quantityCommitted = nonNegativeNumber(req.body?.quantityCommitted, 'quantityCommitted');
  const unitPrice = nonNegativeNumber(req.body?.unitPrice, 'unitPrice');
  if (!(await Buyer.findById(buyerId))) return res.status(404).json({ error: 'buyer not found' });
  if (!(await Project.findById(projectId))) return res.status(404).json({ error: 'project not found' });
  optionalIsoDate(req.body?.startDate, 'startDate');
  optionalIsoDate(req.body?.endDate, 'endDate');

  let doc;
  try {
    doc = await OfftakeAgreement.create({
      agreementNumber,
      buyerId,
      projectId,
      crop: optionalString(req.body?.crop),
      quantityCommitted,
      unit: optionalString(req.body?.unit) || 'kg',
      unitPrice,
      contractValue: mul(quantityCommitted, unitPrice),
      startDate: req.body?.startDate || '',
      endDate: req.body?.endDate || '',
      status: req.body?.status ? enumValue(req.body.status, OFFTAKE_STATUSES, 'status') : 'active'
    });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'An agreement with this number already exists.' });
    throw e;
  }

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.CREATE_OFFTAKE,
    entityType: EntityTypes.OFFTAKE,
    entityId: doc._id.toString(),
    description: `Offtake agreement ${doc.agreementNumber} created (${doc.contractValue} value)`,
    status: ActivityStatus.SUCCESS,
    metadata: { agreementNumber: doc.agreementNumber, buyerId, projectId, contractValue: doc.contractValue }
  });

  const [enriched] = await withNames([{ id: doc._id, ...doc.toObject(), _id: undefined }]);
  res.status(201).json(enriched);
}));

r.patch('/:id', asyncH(async (req, res) => {
  const existing = await OfftakeAgreement.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'offtake agreement not found' });

  const update = {};
  if (req.body?.crop !== undefined) update.crop = optionalString(req.body.crop);
  if (req.body?.unit !== undefined) update.unit = optionalString(req.body.unit) || 'kg';
  if (req.body?.quantityCommitted !== undefined) update.quantityCommitted = nonNegativeNumber(req.body.quantityCommitted, 'quantityCommitted');
  if (req.body?.unitPrice !== undefined) update.unitPrice = nonNegativeNumber(req.body.unitPrice, 'unitPrice');
  if (req.body?.startDate !== undefined) { optionalIsoDate(req.body.startDate, 'startDate'); update.startDate = req.body.startDate || ''; }
  if (req.body?.endDate !== undefined) { optionalIsoDate(req.body.endDate, 'endDate'); update.endDate = req.body.endDate || ''; }
  if (req.body?.status !== undefined) update.status = enumValue(req.body.status, OFFTAKE_STATUSES, 'status');

  // Recompute contract value if quantity or price changed.
  const qty = update.quantityCommitted ?? existing.quantityCommitted;
  const price = update.unitPrice ?? existing.unitPrice;
  update.contractValue = mul(qty, price);

  const doc = await OfftakeAgreement.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.UPDATE_OFFTAKE,
    entityType: EntityTypes.OFFTAKE,
    entityId: doc._id.toString(),
    description: `Offtake agreement ${doc.agreementNumber} updated`,
    status: ActivityStatus.SUCCESS,
    metadata: { updatedFields: Object.keys(update) }
  });

  const [enriched] = await withNames([{ id: doc._id, ...doc.toObject(), _id: undefined }]);
  res.json(enriched);
}));

export default r;
