import PDFDocument from 'pdfkit';
import { fmtXLM } from './reportFormat.js';

// Render a report object (from reporting.js) to a PDF Buffer. Mirrors the visual
// style of services/pdfStatement.js (A4, Helvetica, simple ruled sections).
export async function generateReportPDF(report) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(22).font('Helvetica-Bold').text('Agri Funds', 50, 50);
      doc.fontSize(13).font('Helvetica').text(report.title, 50, 80);
      doc.fontSize(9).fillColor('#666').text(`Generated: ${new Date().toLocaleString()}`, 50, 100);
      doc.fillColor('black');
      doc.moveTo(50, 118).lineTo(545, 118).stroke();
      doc.y = 130;

      const kv = (label, value) => {
        const y = doc.y;
        doc.fontSize(10).font('Helvetica').fillColor('#444').text(label, 60, y, { width: 300 });
        doc.font('Helvetica-Bold').fillColor('black').text(String(value), 360, y, { width: 185, align: 'right' });
        doc.y = y + 18;
      };
      const heading = (t) => {
        doc.moveDown(0.6);
        doc.fontSize(12).font('Helvetica-Bold').fillColor('black').text(t);
        doc.moveDown(0.2);
      };

      const m = report.metrics || {};
      if (report.type === 'monthly') {
        heading('Financial Summary');
        kv('Capital Deployed', fmtXLM(m.capitalDeployed));
        kv('Revenue Generated', fmtXLM(m.revenueGenerated));
        kv('Profit Generated', fmtXLM(m.profitGenerated));
        kv('Investor Returns', fmtXLM(m.investorReturns));
        kv('Treasury Balance', fmtXLM(m.treasuryBalance));
        heading('Yield Metrics');
        kv('Expected Yield', `${m.yield?.expected ?? 0}`);
        kv('Actual Yield', `${m.yield?.actual ?? 0}`);
        kv('Yield Performance', `${m.yield?.performancePercent ?? 0}%`);
      } else if (report.type === 'quarterly') {
        heading('Quarter Metrics');
        kv('Overall ROI', `${m.overallRoiPercent}%`);
        kv('Capital Utilization', `${m.capitalUtilizationPercent}%`);
        kv('Active Projects', `${m.activeProjects} / ${m.totalProjects}`);
        kv('Total Hectares', `${m.totalHectares}`);
        kv('Yield Performance', `${m.yieldPerformancePercent}%`);
        heading('Project Performance');
        table(doc,
          ['Project', 'Allocated', 'Revenue', 'Profit', 'ROI'],
          (report.projectPerformance || []).map(p => [
            p.name, fmtXLM(p.allocated), fmtXLM(p.revenue), fmtXLM(p.profit), `${p.roiPercent}%`
          ])
        );
      } else if (report.type === 'board') {
        const es = report.executiveSummary || {};
        const fm = report.financialMetrics || {};
        const gm = report.governanceMetrics || {};
        heading('Executive Summary');
        kv('Active Projects', `${es.activeProjects} / ${es.totalProjects}`);
        kv('Capital Deployed', fmtXLM(es.capitalDeployed));
        kv('Total Invested', fmtXLM(es.totalInvested));
        kv('Total Revenue', fmtXLM(es.totalRevenue));
        kv('Total Distributed', fmtXLM(es.totalDistributed));
        heading('Financial Metrics');
        kv('Treasury Balance', fmtXLM(fm.treasuryBalance));
        kv('Available Liquidity', fmtXLM(fm.availableLiquidity));
        kv('Capital Utilization', `${fm.capitalUtilizationPercent}%`);
        kv('Net Platform Position', fmtXLM(fm.netPlatformPosition));
        kv('Outstanding Payments', fmtXLM(fm.outstandingPayments));
        heading('Governance Metrics');
        kv('Pending Approvals', gm.pendingApprovals);
        kv('Milestone Completion', `${gm.milestoneCompletionRate}%`);
        kv('Active Contracts', gm.activeContracts);
        kv('Buyer Verification', `${gm.verifiedBuyers}/${gm.totalBuyers} (${gm.buyerVerificationRate}%)`);
        heading('Risk Indicators');
        if (!report.riskIndicators?.length) {
          doc.fontSize(10).font('Helvetica').text('No active risk indicators.', 60);
        } else {
          report.riskIndicators.forEach(r => {
            doc.fontSize(10).font('Helvetica').fillColor(
              r.level === 'high' ? '#b91c1c' : r.level === 'medium' ? '#b45309' : '#555'
            ).text(`• [${r.level.toUpperCase()}] ${r.label}`, 60);
          });
          doc.fillColor('black');
        }
      }

      // Footer on all pages
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor('#888').text(
          `Agri Funds · ${report.title} · Page ${i + 1} of ${range.count}`,
          50, 800, { align: 'center', width: 495 }
        );
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function table(doc, headers, rows) {
  const colX = [60, 230, 330, 420, 500];
  let y = doc.y + 4;
  doc.fontSize(9).font('Helvetica-Bold');
  headers.forEach((h, i) => doc.text(h, colX[i], y, { width: (colX[i + 1] || 545) - colX[i] - 4 }));
  y += 14;
  doc.moveTo(50, y - 2).lineTo(545, y - 2).stroke();
  doc.font('Helvetica').fontSize(9);
  rows.forEach(row => {
    if (y > 760) { doc.addPage(); y = 60; }
    row.forEach((cell, i) => doc.text(String(cell), colX[i], y, { width: (colX[i + 1] || 545) - colX[i] - 4 }));
    y += 14;
  });
  doc.y = y + 6;
}
