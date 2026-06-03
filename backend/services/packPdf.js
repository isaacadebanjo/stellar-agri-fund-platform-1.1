// Investor presentation packs. Four portrait PDF documents composed from the
// live snapshot, each tuned to its audience:
//   investor  — Investor Briefing Pack
//   committee — Investment Committee Pack
//   board     — Board Pack
//   partner   — Partner Pack
// Returns a PDF Buffer. Reuses the shared pdfKit helpers and the metrics snapshot.
import PDFDocument from 'pdfkit';
import { COLORS, fmtXLM, metricCards, bulletList } from './pdfKit.js';

const M = 48;
const PAGE_W = 595;
const PAGE_H = 842;
const W = PAGE_W - 2 * M;

export const PACK_KINDS = {
  investor: 'Investor Briefing Pack',
  committee: 'Investment Committee Pack',
  board: 'Board Pack',
  partner: 'Partner Pack'
};

export async function generatePackPDF(kind, snap) {
  const title = PACK_KINDS[kind];
  if (!title) {
    throw Object.assign(new Error(`unknown pack kind: ${kind}`), { httpStatus: 400 });
  }
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ctx = makeCtx(doc, snap, title);
      ctx.cover();
      SECTIONS[kind](ctx, snap);

      // Footer on every page.
      const range = doc.bufferedPageRange();
      for (let p = 0; p < range.count; p++) {
        doc.switchToPage(p);
        doc.fillColor(COLORS.mute).font('Helvetica').fontSize(8).text(
          `${snap.org.name} · ${title} · Confidential · Page ${p + 1} of ${range.count}`,
          M, PAGE_H - 32, { width: W, align: 'center' });
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Drawing context with a moving cursor and pagination-aware section helpers.
function makeCtx(doc, snap, title) {
  const ctx = { doc, y: 0 };

  const ensure = (need) => {
    if (ctx.y + need > PAGE_H - 60) { doc.addPage({ size: 'A4', margin: 0 }); ctx.y = M; }
  };

  ctx.cover = () => {
    doc.rect(0, 0, PAGE_W, 120).fill(COLORS.brand);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(24).text(snap.org.name, M, 32);
    doc.font('Helvetica').fontSize(13).fillColor('#d1fae5').text(title, M, 64);
    doc.fontSize(9).fillColor('#a7f3d0').text(
      `${new Date(snap.generatedAt).toLocaleDateString()} · Readiness ${snap.scores.investmentReadinessScore}/100 · ${snap.scores.readinessBand}`,
      M, 86);
    ctx.y = 140;
  };

  ctx.heading = (t) => {
    ensure(40);
    doc.fillColor(COLORS.brandDark).font('Helvetica-Bold').fontSize(13).text(t, M, ctx.y);
    ctx.y = doc.y + 4;
    doc.moveTo(M, ctx.y).lineTo(PAGE_W - M, ctx.y).strokeColor(COLORS.line).lineWidth(1).stroke();
    ctx.y += 10;
  };

  ctx.para = (text) => {
    ensure(40);
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(10).text(text, M, ctx.y, { width: W });
    ctx.y = doc.y + 8;
  };

  ctx.bullets = (items, color) => {
    ensure(items.length * 18 + 10);
    ctx.y = bulletList(doc, M, ctx.y, W, items, { size: 10, gap: 6, color });
    ctx.y += 6;
  };

  ctx.cards = (items, cols = 3) => {
    const rows = Math.ceil(items.length / cols);
    ensure(rows * 78 + 10);
    ctx.y = metricCards(doc, M, ctx.y, W, items, { cols, cardH: 64, gap: 10 }) + 6;
  };

  ctx.kv = (pairs) => {
    ensure(pairs.length * 18 + 6);
    doc.font('Helvetica').fontSize(10);
    for (const [label, value] of pairs) {
      doc.fillColor(COLORS.slate).text(label, M + 4, ctx.y, { width: W * 0.6 });
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').text(String(value), M + W * 0.6, ctx.y, { width: W * 0.4 - 4, align: 'right' });
      doc.font('Helvetica');
      ctx.y += 18;
    }
    ctx.y += 6;
  };

  return ctx;
}

// Shared section builders.
function highlights(ctx, snap) {
  ctx.heading('Executive Highlights');
  ctx.bullets(snap.highlights, COLORS.ink);
}
function capitalSummary(ctx, snap) {
  const t = snap.treasury, k = snap.kpi;
  ctx.heading('Capital & Returns');
  ctx.cards([
    { label: 'Total Invested', value: fmtXLM(t.totalInvestedCapital) },
    { label: 'Capital Deployed', value: fmtXLM(t.totalAllocatedCapital) },
    { label: 'Total Revenue', value: fmtXLM(t.totalRevenue) },
    { label: 'Distributed', value: fmtXLM(k.totalDistributed) },
    { label: 'Realised ROI', value: `${k.investorRoiPercent}%` },
    { label: 'Gross Margin', value: `${k.grossMarginPercent}%` }
  ], 3);
}
function treasurySection(ctx, snap) {
  const t = snap.treasury;
  ctx.heading('Treasury Position');
  ctx.kv([
    ['Treasury balance', fmtXLM(t.treasuryBalance)],
    ['Available liquidity', fmtXLM(t.availableLiquidity)],
    ['Liquidity health', t.liquidityHealth],
    ['Capital utilization', `${t.capitalUtilizationPercent}%`],
    ['Net platform position', fmtXLM(t.netPlatformPosition)]
  ]);
  const h = snap.forecast?.horizons?.['90'];
  if (h) ctx.para(`90-day forecast: ${fmtXLM(h.expectedInflows)} expected in, ${fmtXLM(h.expectedOutflows)} out → projected ending balance ${fmtXLM(h.endingBalance)}.`);
}
function riskSection(ctx, snap) {
  const r = snap.risk;
  ctx.heading(`Risk Profile — ${r.overallRiskScore}/100 (${r.overallRiskLevel})`);
  const c = r.categories || {};
  ctx.kv([
    ['Liquidity risk', `${c.liquidityRisk?.score ?? 0}/100 (${c.liquidityRisk?.level ?? 'low'})`],
    ['Payment delay risk', `${c.paymentDelayRisk?.score ?? 0}/100 (${c.paymentDelayRisk?.level ?? 'low'})`],
    ['Operational risk', `${c.operationalRisk?.score ?? 0}/100 (${c.operationalRisk?.level ?? 'low'})`],
    ['Buyer concentration', `${c.buyerConcentration?.score ?? 0}/100 (top ${c.buyerConcentration?.topShare ?? 0}%)`],
    ['Revenue concentration', `${c.revenueConcentration?.score ?? 0}/100 (top ${c.revenueConcentration?.topShare ?? 0}%)`]
  ]);
  if (snap.riskIndicators?.length) {
    ctx.bullets(snap.riskIndicators.map(ri => `[${(ri.level || '').toUpperCase()}] ${ri.label}`));
  }
}
function governanceSection(ctx, snap) {
  const g = snap.governance;
  ctx.heading('Governance & Controls');
  ctx.kv([
    ['Pending approvals', g.pendingApprovals ?? 0],
    ['Milestone completion', `${g.milestoneCompletionRate ?? 0}%`],
    ['Active contracts', g.activeContracts ?? 0],
    ['Buyer verification', `${g.verifiedBuyers ?? 0}/${g.totalBuyers ?? 0} (${g.buyerVerificationRate ?? 0}%)`]
  ]);
}
function capabilities(ctx) {
  ctx.heading('Platform Capabilities');
  ctx.bullets([
    'Treasury management with liquidity forecasting and obligation tracking.',
    'Governance: approval gates and milestone-based capital release with full audit trail.',
    'Risk analytics: concentration, liquidity, payment-delay and operational risk, scored and trended.',
    'Commercial pipeline: buyers, offtake agreements, deliveries and invoice/payment cycles.',
    'Investor data room, board/investor reporting (PDF & Excel), and verifiable on-chain settlement.'
  ]);
}
function roadmap(ctx) {
  ctx.heading('Roadmap');
  ctx.bullets([
    'Now: live transparent platform on Stellar testnet.',
    'Next: mainnet settlement with production custody and compliance.',
    'Then: multi-country scale (South Africa, Cameroon, Kenya, Nigeria) with local currencies.',
    'Future: AI-assisted investment-committee briefings and risk monitoring.'
  ]);
}
function transparency(ctx, snap) {
  ctx.heading('Blockchain Transparency');
  ctx.para(`Farmer payouts and investor distributions settle as real ${snap.org.network} transactions, each independently verifiable on a public explorer and linked from statements and the activity log.`);
}
function recommendation(ctx, snap) {
  ctx.heading('Committee View');
  ctx.para(`The platform is rated ${snap.scores.readinessBand.toLowerCase()} at ${snap.scores.investmentReadinessScore}/100, with ${snap.governance.buyerVerificationRate ?? 0}% buyer verification, ${snap.governance.milestoneCompletionRate ?? 0}% milestone completion and overall risk ${snap.risk.overallRiskLevel}. Treasury liquidity is ${snap.treasury.liquidityHealth.toLowerCase()}.`);
}

const SECTIONS = {
  investor: (ctx, snap) => { highlights(ctx, snap); capitalSummary(ctx, snap); transparency(ctx, snap); riskSection(ctx, snap); },
  committee: (ctx, snap) => { recommendation(ctx, snap); treasurySection(ctx, snap); riskSection(ctx, snap); governanceSection(ctx, snap); capitalSummary(ctx, snap); },
  board: (ctx, snap) => { highlights(ctx, snap); treasurySection(ctx, snap); governanceSection(ctx, snap); riskSection(ctx, snap); },
  partner: (ctx, snap) => { capabilities(ctx); capitalSummary(ctx, snap); transparency(ctx, snap); roadmap(ctx); }
};
