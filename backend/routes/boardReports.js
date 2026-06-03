import { Router } from 'express';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { buildReport } from '../services/reporting.js';
import { generateReportPDF } from '../services/pdfReports.js';
import { generateReportExcel } from '../services/excelReports.js';
import { reportFileName } from '../services/reportFormat.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

const intIn = (v, def, lo, hi) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, n));
};

// Deliver a report as JSON (default), PDF, or Excel based on ?format=.
async function deliver(req, res, kind, params) {
  const report = await buildReport(kind, params);
  const format = (req.query.format || 'json').toLowerCase();

  if (format === 'json') return res.json(report);

  logActivity({
    userId: req.user?.id,
    userRole: req.user?.role || 'system',
    actionType: ActivityTypes.REPORT_GENERATED,
    entityType: EntityTypes.REPORT,
    entityId: kind,
    description: `${report.title} generated (${format.toUpperCase()})`,
    status: ActivityStatus.SUCCESS,
    metadata: { kind, format }
  });

  if (format === 'pdf') {
    const buf = await generateReportPDF(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reportFileName(report, 'pdf')}"`);
    return res.send(buf);
  }
  if (format === 'xlsx' || format === 'excel') {
    const buf = await generateReportExcel(report);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${reportFileName(report, 'xlsx')}"`);
    return res.send(buf);
  }
  return res.status(400).json({ error: 'format must be one of: json, pdf, xlsx' });
}

r.get('/monthly', asyncH((req, res) => {
  const now = new Date();
  const year = intIn(req.query.year, now.getUTCFullYear(), 2000, 3000);
  const month = intIn(req.query.month, now.getUTCMonth() + 1, 1, 12);
  return deliver(req, res, 'monthly', { year, month });
}));

r.get('/quarterly', asyncH((req, res) => {
  const now = new Date();
  const year = intIn(req.query.year, now.getUTCFullYear(), 2000, 3000);
  const quarter = intIn(req.query.quarter, Math.floor(now.getUTCMonth() / 3) + 1, 1, 4);
  return deliver(req, res, 'quarterly', { year, quarter });
}));

r.get('/board', asyncH((req, res) => deliver(req, res, 'board', {})));

export default r;
