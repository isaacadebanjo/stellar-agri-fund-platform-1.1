import { Router } from 'express';
import Investor from '../models/Investor.js';
import Project from '../models/Project.js';
import Distribution from '../models/Distribution.js';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { generateInvestorStatementPDF } from '../services/pdfStatement.js';
import { logActivity, ActivityTypes, EntityTypes, ActivityStatus } from '../services/activityLog.js';

const r = Router();
r.use(requireRole('admin'));

/**
 * GET /api/investors/:id/statement/pdf
 * Generate and download investor PDF statement
 */
r.get('/:id/statement/pdf', asyncH(async (req, res) => {
  const investor = await Investor.findById(req.params.id);
  if (!investor) return res.status(404).json({ error: 'investor not found' });

  const wallet = await Wallet.findById(investor.walletId);
  const investments = await Transaction.find({
    stage: 'investment',
    senderId: investor.walletId
  }).sort({ timestamp: -1 });

  const distributions = await Distribution.find({
    investorId: investor._id
  }).sort({ timestamp: -1 });

  const projectIds = Array.from(new Set(distributions.map(d => d.projectId)));
  const projects = await Project.find({ _id: { $in: projectIds } });

  try {
    const pdfBuffer = await generateInvestorStatementPDF({
      investor,
      wallet,
      investmentTxs: investments,
      distributions,
      projects
    });

    // Log the statement generation
    logActivity({
      userId: req.user?.id,
      userRole: req.user?.role || 'system',
      actionType: ActivityTypes.STATEMENT_GENERATED,
      entityType: EntityTypes.REPORT,
      entityId: investor._id.toString(),
      description: `Generated PDF statement for investor "${investor.name}"`,
      status: ActivityStatus.SUCCESS,
      metadata: {
        investorName: investor.name,
        investorId: investor._id.toString()
      }
    });

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Statement-${investor.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    
    // Log failed PDF generation
    logActivity({
      userId: req.user?.id,
      userRole: req.user?.role || 'system',
      actionType: ActivityTypes.STATEMENT_GENERATED,
      entityType: EntityTypes.REPORT,
      entityId: investor._id.toString(),
      description: `Failed to generate PDF statement for investor "${investor.name}" - ${err.message}`,
      status: ActivityStatus.FAILED,
      metadata: {
        investorName: investor.name,
        investorId: investor._id.toString(),
        error: err.message
      }
    });

    res.status(500).json({ error: 'Failed to generate PDF statement', details: err.message });
  }
}));

export default r;
