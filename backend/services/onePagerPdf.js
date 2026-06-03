// Executive one-pager. A single portrait A4 page summarising the platform for an
// investment committee — purpose, capabilities, capital flow, controls, and
// roadmap — with a live metrics strip. Returns a PDF Buffer.
import PDFDocument from 'pdfkit';
import { COLORS, fmtXLM, metricCards } from './pdfKit.js';

const M = 48;
const PAGE_W = 595;

export async function generateOnePagerPDF(snap) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = PAGE_W - 2 * M;
      const t = snap.treasury;
      const k = snap.kpi;
      const g = snap.governance;
      const r = snap.risk;

      // Header band
      doc.rect(0, 0, PAGE_W, 92).fill(COLORS.brand);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text(snap.org.name, M, 26);
      doc.font('Helvetica').fontSize(11).fillColor('#d1fae5').text('Executive Summary', M, 54);
      doc.fontSize(9).fillColor('#a7f3d0').text(
        `${new Date(snap.generatedAt).toLocaleDateString()} · Readiness ${snap.scores.investmentReadinessScore}/100 · ${snap.scores.readinessBand}`,
        M, 70);

      let y = 108;

      // Metrics strip
      y = metricCards(doc, M, y, W, [
        { label: 'Capital Deployed', value: fmtXLM(t.totalAllocatedCapital) },
        { label: 'Realised ROI', value: `${k.investorRoiPercent}%` },
        { label: 'Treasury Health', value: t.liquidityHealth },
        { label: 'Overall Risk', value: `${r.overallRiskScore}/100` }
      ], { cols: 4, cardH: 64, gap: 10 }) + 8;

      const section = (title, lines) => {
        doc.fillColor(COLORS.brandDark).font('Helvetica-Bold').fontSize(11).text(title, M, y);
        y = doc.y + 3;
        doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.slate);
        for (const line of lines) {
          doc.circle(M + 3, y + 5, 1.8).fill(COLORS.brand);
          doc.fillColor(COLORS.slate).text(line, M + 12, y, { width: W - 12 });
          y = doc.y + 4;
        }
        y += 6;
      };

      section('Purpose', [
        'Channel institutional capital into smallholder agriculture with full transparency, governance and on-chain settlement.'
      ]);
      section('Current Capabilities', [
        'Treasury management, governance approvals, milestone-based capital release, risk analytics, forecasting.',
        'Commercial pipeline (buyers, offtake, deliveries, invoices), yield reporting and per-hectare KPIs.',
        'Investor data room, board/monthly/quarterly reporting (PDF & Excel), and investor statements.'
      ]);
      section('Capital Flow', [
        `Investor → Treasury → Projects → Farmers → Revenue → Distributions → Investor Returns.`,
        `${fmtXLM(t.totalInvestedCapital)} invested · ${fmtXLM(t.totalAllocatedCapital)} deployed · ${fmtXLM(k.totalDistributed)} distributed.`
      ]);
      section('Governance Controls', [
        `${g.pendingApprovals ?? 0} approval(s) pending · milestone completion ${g.milestoneCompletionRate ?? 0}% · ${g.activeContracts ?? 0} active contracts.`,
        'Approval gates and milestone-gated release with a complete audit trail.'
      ]);
      section('Risk Controls', [
        `Overall risk ${r.overallRiskScore}/100 (${r.overallRiskLevel}); concentration, liquidity, payment-delay and operational risk scored and trended.`
      ]);
      section('Investor Transparency', [
        `Verifiable on-chain settlement on ${snap.org.network}; per-investor statements and a scoped data room.`,
        `Gross margin ${k.grossMarginPercent}% · profit margin ${k.profitMarginPercent}%.`
      ]);
      section('Operational Monitoring', [
        'Farm visit reports (GPS, findings, health & compliance scores) and real-time activity timeline.'
      ]);
      section('Future Roadmap', [
        'Mainnet settlement, multi-country scale (ZA · CM · KE · NG), and AI-assisted committee tooling.'
      ]);

      doc.fillColor(COLORS.mute).font('Helvetica').fontSize(8).text(
        `${snap.org.name} · Confidential · generated ${new Date(snap.generatedAt).toLocaleString()}`,
        M, 800, { width: W, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
