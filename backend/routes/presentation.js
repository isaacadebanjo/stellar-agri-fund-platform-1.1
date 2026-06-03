import { Router } from 'express';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { getSnapshot } from '../services/metricsSnapshot.js';
import { generateDeckPDF } from '../services/deckPdf.js';
import { generateOnePagerPDF } from '../services/onePagerPdf.js';
import { generateArchitecturePDF } from '../services/architecturePdf.js';
import { generatePackPDF, PACK_KINDS } from '../services/packPdf.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

// Investor Presentation Center. Generates board-ready PDF artifacts from the live
// metrics snapshot. Admin-only (these expose platform-wide figures). Read-only —
// nothing here mutates business state beyond an audit-log entry.
const r = Router();
r.use(requireRole('admin'));

const dateStamp = () => new Date().toISOString().slice(0, 10);

function sendPdf(res, buf, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}

function logGen(req, what) {
  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.REPORT_GENERATED,
    entityType: EntityTypes.REPORT,
    entityId: what,
    description: `Presentation generated: ${what}`,
    status: ActivityStatus.SUCCESS,
    metadata: { artifact: what }
  });
}

// Live snapshot as JSON — powers the Presentation Center preview cards.
r.get('/snapshot', asyncH(async (req, res) => {
  res.json(await getSnapshot());
}));

// 15-slide investor deck (landscape PDF).
r.get('/deck.pdf', asyncH(async (req, res) => {
  const buf = await generateDeckPDF(await getSnapshot());
  logGen(req, 'investor-deck');
  sendPdf(res, buf, `Agri-Funds-Investor-Deck-${dateStamp()}.pdf`);
}));

// Executive one-pager (portrait PDF).
r.get('/one-pager.pdf', asyncH(async (req, res) => {
  const buf = await generateOnePagerPDF(await getSnapshot());
  logGen(req, 'executive-one-pager');
  sendPdf(res, buf, `Agri-Funds-Executive-Summary-${dateStamp()}.pdf`);
}));

// Architecture diagrams (landscape PDF, static).
r.get('/architecture.pdf', asyncH(async (req, res) => {
  const buf = await generateArchitecturePDF();
  logGen(req, 'architecture-diagrams');
  sendPdf(res, buf, `Agri-Funds-Architecture-${dateStamp()}.pdf`);
}));

// Audience packs: investor | committee | board | partner.
r.get('/pack/:kind.pdf', asyncH(async (req, res) => {
  const kind = req.params.kind;
  if (!PACK_KINDS[kind]) return res.status(400).json({ error: `unknown pack: ${kind}` });
  const buf = await generatePackPDF(kind, await getSnapshot());
  logGen(req, `pack-${kind}`);
  sendPdf(res, buf, `Agri-Funds-${PACK_KINDS[kind].replace(/\s+/g, '-')}-${dateStamp()}.pdf`);
}));

export default r;
