// Investor deck builder. Renders a 15-slide landscape PDF presentation from the
// live metrics snapshot. Pure rendering — takes a snapshot object (from
// metricsSnapshot.js) and returns a PDF Buffer.
import PDFDocument from 'pdfkit';
import {
  COLORS, SLIDE, fmtXLM, slideBackground, slideHeader, slideFooter,
  metricCards, bulletList, drawFlowDiagram, drawBarChart, scorePill, levelColor
} from './pdfKit.js';

const PAGE_OPTS = { size: 'A4', layout: 'landscape', margin: 0 };

export async function generateDeckPDF(snap) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ ...PAGE_OPTS, bufferPages: true, autoFirstPage: false });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const slides = buildSlides(snap);
      slides.forEach((render, i) => {
        doc.addPage(PAGE_OPTS);
        slideBackground(doc);
        render(doc, i + 1, slides.length);
        if (i > 0) slideFooter(doc, `${snap.org.name} · Confidential · ${new Date(snap.generatedAt).toLocaleDateString()}`);
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function buildSlides(snap) {
  const t = snap.treasury;
  const k = snap.kpi;
  const g = snap.governance;
  const r = snap.risk;
  const x = SLIDE.margin;
  const W = SLIDE.w - 2 * SLIDE.margin;

  return [
    // 1. Cover
    (doc) => {
      doc.rect(0, 0, SLIDE.w, SLIDE.h).fill(COLORS.brand);
      doc.rect(0, 0, SLIDE.w, 6).fill(COLORS.brandDark);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(46).text(snap.org.name, x, 200, { width: W });
      doc.font('Helvetica').fontSize(18).fillColor('#d1fae5').text(snap.org.tagline, x, 262, { width: W });
      doc.fontSize(12).fillColor('#a7f3d0').text(
        `Investor Briefing · ${new Date(snap.generatedAt).toLocaleDateString()} · ${snap.org.network}`, x, 300, { width: W });
      // readiness badge
      doc.roundedRect(x, 360, 260, 56, 10).fillColor('#ffffff').fill();
      doc.fillColor(COLORS.brand).font('Helvetica-Bold').fontSize(11).text('INVESTMENT READINESS', x + 16, 374);
      doc.fillColor(COLORS.ink).fontSize(20).text(
        `${snap.scores.investmentReadinessScore}/100 · ${snap.scores.readinessBand}`, x + 16, 390);
    },

    // 2. Problem Statement
    (doc, i, n) => {
      const y = slideHeader(doc, 'The Problem', 'Why institutional capital struggles to reach agriculture', { index: i, total: n });
      bulletList(doc, x, y, W, [
        'Smallholder agriculture is capital-starved, yet hard for institutions to fund: no transparency, no audit trail, no governance.',
        'Capital deployment is opaque — investors cannot see where funds go, whether farmers are paid, or how revenue is generated.',
        'Manual reporting and reconciliation make due diligence slow and trust expensive.',
        'Returns are difficult to verify, and there is no single source of truth across treasury, operations, and governance.'
      ], { size: 14, gap: 14 });
    },

    // 3. Solution Overview
    (doc, i, n) => {
      const y = slideHeader(doc, 'The Solution', 'A transparent, governed, blockchain-settled investment platform', { index: i, total: n });
      bulletList(doc, x, y, W, [
        'End-to-end capital tracking: every investment, allocation, payout, and distribution is recorded and reconciled.',
        'Real on-chain settlement on Stellar — farmer payouts and investor distributions are verifiable transactions.',
        'Built-in governance: approval gates, milestone-based capital release, and a complete audit trail.',
        'Institutional reporting: board packs, investor statements, risk analytics, and treasury forecasting on demand.'
      ], { size: 14, gap: 14 });
    },

    // 4. Platform Overview
    (doc, i, n) => {
      const y = slideHeader(doc, 'Platform Overview', 'One platform across the full investment lifecycle', { index: i, total: n });
      metricCards(doc, x, y, W, [
        { label: 'Treasury', value: 'Capital & liquidity', sub: 'flows, obligations, forecasting' },
        { label: 'Governance', value: 'Approvals & release', sub: 'milestone-gated capital' },
        { label: 'Risk', value: 'Concentration & liquidity', sub: 'scored, mapped, trended' },
        { label: 'Commercial', value: 'Buyers & offtake', sub: 'contracts, deliveries, invoices' },
        { label: 'Reporting', value: 'Board & investor', sub: 'PDF / Excel on demand' },
        { label: 'Data Room', value: 'Due-diligence', sub: 'documents & statements' }
      ], { cols: 3, cardH: 74 });
    },

    // 5. Capital Flow
    (doc, i, n) => {
      const y = slideHeader(doc, 'Capital Flow', 'How investor capital moves through the platform', { index: i, total: n });
      drawFlowDiagram(doc, x, y, W * 0.52, [
        'Investor', 'Treasury', 'Projects', 'Farmers', 'Revenue', 'Distributions', 'Investor Returns'
      ], { vertical: true, boxW: 240, boxH: 30, gap: 14 });
      metricCards(doc, x + W * 0.56, y + 10, W * 0.44, [
        { label: 'Total Invested', value: fmtXLM(t.totalInvestedCapital) },
        { label: 'Capital Deployed', value: fmtXLM(t.totalAllocatedCapital) },
        { label: 'Total Revenue', value: fmtXLM(t.totalRevenue) },
        { label: 'Distributed to Investors', value: fmtXLM(k.totalDistributed) }
      ], { cols: 2, cardH: 80 });
    },

    // 6. Governance Layer
    (doc, i, n) => {
      const y = slideHeader(doc, 'Governance Layer', 'Controls that make capital release accountable', { index: i, total: n });
      drawFlowDiagram(doc, x, y, W * 0.5, [
        'Governance Layer', 'Approvals', 'Capital Release', 'Audit Logs', 'Reporting'
      ], { vertical: true, boxW: 230, boxH: 30, gap: 14 });
      metricCards(doc, x + W * 0.55, y + 10, W * 0.45, [
        { label: 'Pending Approvals', value: g.pendingApprovals ?? 0, sub: 'awaiting sign-off' },
        { label: 'Milestone Completion', value: `${g.milestoneCompletionRate ?? 0}%` },
        { label: 'Active Contracts', value: g.activeContracts ?? 0 },
        { label: 'Buyer Verification', value: `${g.buyerVerificationRate ?? 0}%` }
      ], { cols: 2, cardH: 80 });
    },

    // 7. Treasury Layer
    (doc, i, n) => {
      const y = slideHeader(doc, 'Treasury Layer', 'Capital position, liquidity and obligations', { index: i, total: n });
      const y2 = metricCards(doc, x, y, W, [
        { label: 'Treasury Balance', value: fmtXLM(t.treasuryBalance) },
        { label: 'Available Liquidity', value: fmtXLM(t.availableLiquidity), sub: `health: ${t.liquidityHealth}` },
        { label: 'Capital Utilization', value: `${t.capitalUtilizationPercent}%` },
        { label: 'Net Platform Position', value: fmtXLM(t.netPlatformPosition) },
        { label: 'Pending Payouts', value: fmtXLM(t.pendingPayouts) },
        { label: 'Pending Distributions', value: fmtXLM(t.pendingDistributions) }
      ], { cols: 3, cardH: 74 });
      const h = snap.forecast?.horizons?.['90'];
      if (h) {
        doc.fillColor(COLORS.slate).font('Helvetica').fontSize(10).text(
          `90-day liquidity forecast: ${fmtXLM(h.expectedInflows)} in, ${fmtXLM(h.expectedOutflows)} out → projected ${fmtXLM(h.endingBalance)}.`,
          x, y2 + 4, { width: W });
      }
    },

    // 8. Risk Management
    (doc, i, n) => {
      const y = slideHeader(doc, 'Risk Management', `Overall risk: ${r.overallRiskScore}/100 (${r.overallRiskLevel})`, { index: i, total: n });
      const cats = r.categories || {};
      const rows = [
        ['Liquidity', cats.liquidityRisk], ['Payment Delay', cats.paymentDelayRisk],
        ['Operational', cats.operationalRisk], ['Revenue Concentration', cats.revenueConcentration],
        ['Buyer Concentration', cats.buyerConcentration], ['Project Concentration', cats.projectConcentration]
      ];
      const half = W / 2 - 16;
      rows.forEach(([label, c], idx) => {
        const col = idx % 2;
        const cx = x + col * (half + 32);
        const cyBase = y + Math.floor(idx / 2) * 60;
        scorePillInline(doc, cx, cyBase, half, label, c?.score ?? 0, c?.level);
      });
    },

    // 9. Investor Reporting
    (doc, i, n) => {
      const y = slideHeader(doc, 'Investor Reporting', 'Verifiable returns and on-demand institutional reporting', { index: i, total: n });
      const y2 = metricCards(doc, x, y, W, [
        { label: 'Realised ROI', value: `${k.investorRoiPercent}%` },
        { label: 'Gross Margin', value: `${k.grossMarginPercent}%` },
        { label: 'Profit Margin', value: `${k.profitMarginPercent}%` },
        { label: 'Total Distributed', value: fmtXLM(k.totalDistributed) }
      ], { cols: 4, cardH: 74 });
      bulletList(doc, x, y2 + 6, W, [
        'Per-investor statements (PDF) with full investment and distribution history.',
        'Board, monthly and quarterly reports exportable as PDF and Excel.',
        'A secure data room scopes every document and report to the right investor.'
      ], { size: 12, gap: 10 });
    },

    // 10. Blockchain Transparency
    (doc, i, n) => {
      const y = slideHeader(doc, 'Blockchain Transparency', `Settlement on ${snap.org.network}`, { index: i, total: n });
      bulletList(doc, x, y, W, [
        'Farmer payouts and investor distributions settle as real Stellar transactions — independently verifiable on a public explorer.',
        'Every money movement carries a transaction hash linked from the activity log and statements.',
        'Custodial wallets are encrypted at rest (AES-256-GCM); non-custodial investors can connect their own wallet via SEP-10.',
        'The ledger of investments, allocations, payouts and distributions reconciles to the treasury balance.'
      ], { size: 13, gap: 12 });
    },

    // 11. Operational Controls
    (doc, i, n) => {
      const y = slideHeader(doc, 'Operational Controls', 'Discipline from capital release to the field', { index: i, total: n });
      bulletList(doc, x, y, W, [
        'Milestone-based capital release caps allocations at approved milestone budgets for governed projects.',
        'Approval gates require sign-off on sensitive actions above configurable thresholds.',
        'Farm visit reports capture GPS, inspector findings, and health / compliance scores from the field.',
        'A complete, immutable activity log provides an end-to-end audit trail.'
      ], { size: 13, gap: 12 });
    },

    // 12. Yield & Revenue Tracking
    (doc, i, n) => {
      const y = slideHeader(doc, 'Yield & Revenue Tracking', 'Per-hectare economics and project performance', { index: i, total: n });
      const y2 = metricCards(doc, x, y, W, [
        { label: 'Revenue / Hectare', value: fmtXLM(k.revenuePerHectare) },
        { label: 'Cost / Hectare', value: fmtXLM(k.costPerHectare) },
        { label: 'Yield / Hectare', value: `${k.yieldPerHectare}` },
        { label: 'Total Hectares', value: `${k.totalHectares}` }
      ], { cols: 4, cardH: 70 });
      const series = (k.byProject || []).slice(0, 6).map(p => ({ label: (p.name || '').slice(0, 12), value: p.revenue }));
      if (series.length) {
        doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11).text('Revenue by project', x, y2 + 8);
        drawBarChart(doc, x, y2 + 26, W, 150, series, { valueFmt: (v) => fmtXLM(v).replace(' XLM', '') });
      }
    },

    // 13. Investment Readiness
    (doc, i, n) => {
      const y = slideHeader(doc, 'Investment Readiness', 'A composite of de-risking, governance and capital efficiency', { index: i, total: n });
      doc.fillColor(COLORS.brand).font('Helvetica-Bold').fontSize(64)
        .text(`${snap.scores.investmentReadinessScore}`, x, y + 6, { continued: true })
        .fillColor(COLORS.mute).fontSize(24).text('/100');
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(16).text(snap.scores.readinessBand, x, y + 84);
      const right = x + W * 0.42;
      const rw = W * 0.58;
      let yy = scorePill(doc, right, y, rw, 'De-risking (100 − overall risk)', 100 - r.overallRiskScore);
      yy = scorePill(doc, right, yy, rw, 'Buyer verification', g.buyerVerificationRate ?? 0);
      scorePill(doc, right, yy, rw, 'Capital utilization', Math.min(k.capitalUtilizationPercent ?? 0, 100));
    },

    // 14. Roadmap
    (doc, i, n) => {
      const y = slideHeader(doc, 'Roadmap', 'From transparent testnet platform to multi-market scale', { index: i, total: n });
      metricCards(doc, x, y, W, [
        { label: 'Now', value: 'Live on testnet', sub: 'treasury, governance, risk, reporting, data room' },
        { label: 'Next', value: 'Mainnet settlement', sub: 'production custody & compliance' },
        { label: 'Then', value: 'Multi-country scale', sub: 'ZA · CM · KE · NG, local currencies' },
        { label: 'Future', value: 'AI committee tooling', sub: 'automated briefings & risk monitoring' }
      ], { cols: 4, cardH: 92 });
    },

    // 15. Closing Summary
    (doc, i, n) => {
      const y = slideHeader(doc, 'Summary', 'Why this platform is ready for institutional capital', { index: i, total: n });
      bulletList(doc, x, y, W, snap.highlights, { size: 14, gap: 14, color: COLORS.ink });
      doc.fillColor(COLORS.brand).font('Helvetica-Bold').fontSize(13)
        .text('Transparent. Governed. On-chain. Investment ready.', x, SLIDE.h - 90, { width: W });
    }
  ];

  // Inline score pill used on the risk slide (compact, no label uppercase pad).
  function scorePillInline(doc, px, py, width, label, score, level) {
    const s = Math.max(0, Math.min(100, score || 0));
    doc.fillColor(COLORS.slate).font('Helvetica-Bold').fontSize(10).text(label, px, py, { width });
    doc.roundedRect(px, py + 16, width, 12, 6).fillColor(COLORS.line).fill();
    doc.roundedRect(px, py + 16, (width * s) / 100, 12, 6).fillColor(levelColor(level)).fill();
    doc.fillColor(COLORS.ink).font('Helvetica').fontSize(9).text(`${s}/100 · ${level || 'low'}`, px, py + 31);
  }
}
