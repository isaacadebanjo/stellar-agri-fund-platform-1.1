import ExcelJS from 'exceljs';
import { fmtXLM } from './reportFormat.js';

// Render a report object (from reporting.js) to an .xlsx Buffer.
export async function generateReportExcel(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Agri Funds';
  wb.created = new Date();

  const ws = wb.addWorksheet('Report');
  ws.columns = [{ width: 36 }, { width: 24 }, { width: 16 }, { width: 16 }, { width: 12 }];

  const titleRow = ws.addRow([report.title]);
  titleRow.font = { bold: true, size: 14 };
  ws.addRow([`Generated: ${new Date().toLocaleString()}`]).font = { italic: true, color: { argb: 'FF888888' } };
  ws.addRow([]);

  const heading = (t) => {
    const row = ws.addRow([t]);
    row.font = { bold: true, size: 12 };
  };
  const kv = (label, value) => {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { color: { argb: 'FF444444' } };
    row.getCell(2).font = { bold: true };
  };

  const m = report.metrics || {};
  if (report.type === 'monthly') {
    heading('Financial Summary');
    kv('Capital Deployed', fmtXLM(m.capitalDeployed));
    kv('Revenue Generated', fmtXLM(m.revenueGenerated));
    kv('Profit Generated', fmtXLM(m.profitGenerated));
    kv('Investor Returns', fmtXLM(m.investorReturns));
    kv('Treasury Balance', fmtXLM(m.treasuryBalance));
    ws.addRow([]);
    heading('Yield Metrics');
    kv('Expected Yield', m.yield?.expected ?? 0);
    kv('Actual Yield', m.yield?.actual ?? 0);
    kv('Yield Performance', `${m.yield?.performancePercent ?? 0}%`);
  } else if (report.type === 'quarterly') {
    heading('Quarter Metrics');
    kv('Overall ROI', `${m.overallRoiPercent}%`);
    kv('Capital Utilization', `${m.capitalUtilizationPercent}%`);
    kv('Active Projects', `${m.activeProjects} / ${m.totalProjects}`);
    kv('Total Hectares', m.totalHectares);
    kv('Yield Performance', `${m.yieldPerformancePercent}%`);
    ws.addRow([]);
    heading('Project Performance');
    const hdr = ws.addRow(['Project', 'Allocated', 'Revenue', 'Profit', 'ROI %']);
    hdr.font = { bold: true };
    (report.projectPerformance || []).forEach(p =>
      ws.addRow([p.name, p.allocated, p.revenue, p.profit, p.roiPercent])
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
    ws.addRow([]);
    heading('Financial Metrics');
    kv('Treasury Balance', fmtXLM(fm.treasuryBalance));
    kv('Available Liquidity', fmtXLM(fm.availableLiquidity));
    kv('Capital Utilization', `${fm.capitalUtilizationPercent}%`);
    kv('Net Platform Position', fmtXLM(fm.netPlatformPosition));
    kv('Outstanding Payments', fmtXLM(fm.outstandingPayments));
    ws.addRow([]);
    heading('Governance Metrics');
    kv('Pending Approvals', gm.pendingApprovals);
    kv('Milestone Completion', `${gm.milestoneCompletionRate}%`);
    kv('Active Contracts', gm.activeContracts);
    kv('Buyer Verification', `${gm.verifiedBuyers}/${gm.totalBuyers} (${gm.buyerVerificationRate}%)`);
    ws.addRow([]);
    heading('Risk Indicators');
    if (!report.riskIndicators?.length) {
      ws.addRow(['No active risk indicators.']);
    } else {
      report.riskIndicators.forEach(r => ws.addRow([r.level.toUpperCase(), r.label]));
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
