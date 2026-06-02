import { Router } from 'express';
import Buyer, { BUYER_STATUSES, VERIFICATION_STATUSES } from '../models/Buyer.js';
import OfftakeAgreement from '../models/OfftakeAgreement.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { paginate, listResponse } from '../services/pagination.js';
import { sum } from '../services/money.js';
import { nonEmptyString, optionalString, optionalEmail, optionalPhone, enumValue } from '../services/validate.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

// Summary cards: active buyers, verified buyers, total contracted volume/value
// (from active offtake agreements). Defined before '/:id' so it isn't shadowed.
r.get('/summary', asyncH(async (req, res) => {
  const [activeBuyers, verifiedBuyers, totalBuyers, contracts] = await Promise.all([
    Buyer.countDocuments({ archived: false, status: 'active' }),
    Buyer.countDocuments({ archived: false, verificationStatus: 'verified' }),
    Buyer.countDocuments({ archived: false }),
    OfftakeAgreement.find({ status: { $in: ['active', 'completed'] } }).lean()
  ]);
  res.json({
    activeBuyers,
    verifiedBuyers,
    totalBuyers,
    totalContractedVolume: sum(contracts, c => c.quantityCommitted),
    totalContractedValue: sum(contracts, c => c.contractValue)
  });
}));

r.get('/', asyncH(async (req, res) => {
  const filter = {};
  if (req.query.archived === 'true') filter.archived = true;
  else if (req.query.archived !== 'all') filter.archived = false;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.verificationStatus) filter.verificationStatus = req.query.verificationStatus;

  const pg = paginate(req.query);
  const cursor = Buyer.find(filter).sort({ createdAt: -1 });
  if (pg) cursor.skip(pg.skip).limit(pg.limit);
  const [buyers, total] = await Promise.all([
    cursor,
    pg ? Buyer.countDocuments(filter) : Promise.resolve(0)
  ]);
  const rows = buyers.map(b => b.toJSON());
  res.json(pg ? listResponse(rows, total, pg) : rows);
}));

r.post('/', asyncH(async (req, res) => {
  const buyer = await Buyer.create({
    name: nonEmptyString(req.body?.name, 'name'),
    company: optionalString(req.body?.company),
    contactPerson: optionalString(req.body?.contactPerson),
    email: optionalEmail(req.body?.email),
    phone: optionalPhone(req.body?.phone),
    country: optionalString(req.body?.country),
    status: req.body?.status ? enumValue(req.body.status, BUYER_STATUSES, 'status') : 'active',
    verificationStatus: req.body?.verificationStatus
      ? enumValue(req.body.verificationStatus, VERIFICATION_STATUSES, 'verificationStatus')
      : 'unverified',
    notes: optionalString(req.body?.notes)
  });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.CREATE_BUYER,
    entityType: EntityTypes.BUYER,
    entityId: buyer._id.toString(),
    description: `Buyer "${buyer.name}" created`,
    status: ActivityStatus.SUCCESS,
    metadata: { name: buyer.name, company: buyer.company }
  });

  res.status(201).json(buyer.toJSON());
}));

r.patch('/:id', asyncH(async (req, res) => {
  const update = {};
  if (req.body?.name !== undefined) update.name = nonEmptyString(req.body.name, 'name');
  if (req.body?.company !== undefined) update.company = optionalString(req.body.company);
  if (req.body?.contactPerson !== undefined) update.contactPerson = optionalString(req.body.contactPerson);
  if (req.body?.email !== undefined) update.email = optionalEmail(req.body.email);
  if (req.body?.phone !== undefined) update.phone = optionalPhone(req.body.phone);
  if (req.body?.country !== undefined) update.country = optionalString(req.body.country);
  if (req.body?.status !== undefined) update.status = enumValue(req.body.status, BUYER_STATUSES, 'status');
  if (req.body?.verificationStatus !== undefined) {
    update.verificationStatus = enumValue(req.body.verificationStatus, VERIFICATION_STATUSES, 'verificationStatus');
  }
  if (req.body?.notes !== undefined) update.notes = optionalString(req.body.notes);

  const buyer = await Buyer.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!buyer) return res.status(404).json({ error: 'buyer not found' });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.UPDATE_BUYER,
    entityType: EntityTypes.BUYER,
    entityId: buyer._id.toString(),
    description: `Buyer "${buyer.name}" updated`,
    status: ActivityStatus.SUCCESS,
    metadata: { updatedFields: Object.keys(update) }
  });

  res.json(buyer.toJSON());
}));

r.post('/:id/archive', asyncH(async (req, res) => {
  const buyer = await Buyer.findByIdAndUpdate(req.params.id, { archived: true }, { new: true });
  if (!buyer) return res.status(404).json({ error: 'buyer not found' });

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.ARCHIVE_BUYER,
    entityType: EntityTypes.BUYER,
    entityId: buyer._id.toString(),
    description: `Buyer "${buyer.name}" archived`,
    status: ActivityStatus.SUCCESS
  });

  res.json(buyer.toJSON());
}));

export default r;
