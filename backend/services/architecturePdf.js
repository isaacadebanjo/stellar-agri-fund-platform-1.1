// Architecture diagrams PDF. Renders the three platform diagrams (capital flow,
// system stack, governance flow) as vector flow charts across landscape pages.
// Returns a PDF Buffer. Static content — no metrics required.
import PDFDocument from 'pdfkit';
import { COLORS, SLIDE, slideBackground, slideHeader, slideFooter, drawFlowDiagram } from './pdfKit.js';

const PAGE_OPTS = { size: 'A4', layout: 'landscape', margin: 0 };

export const ARCHITECTURE_DIAGRAMS = [
  {
    key: 'capital-flow',
    title: 'Diagram A — Capital Flow',
    subtitle: 'How investor capital moves end to end',
    nodes: ['Investor', 'Treasury', 'Projects', 'Farmers', 'Revenue', 'Distributions', 'Investor Returns']
  },
  {
    key: 'system-stack',
    title: 'Diagram B — System Architecture',
    subtitle: 'Request and settlement path',
    nodes: ['Frontend (React)', 'API (Express)', 'MongoDB', 'Stellar Network']
  },
  {
    key: 'governance-flow',
    title: 'Diagram C — Governance Flow',
    subtitle: 'Accountable capital release',
    nodes: ['Governance Layer', 'Approvals', 'Capital Release', 'Audit Logs', 'Reporting']
  }
];

export async function generateArchitecturePDF() {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ ...PAGE_OPTS, bufferPages: true, autoFirstPage: false });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      ARCHITECTURE_DIAGRAMS.forEach((d, i) => {
        doc.addPage(PAGE_OPTS);
        slideBackground(doc);
        const y = slideHeader(doc, d.title, d.subtitle, { index: i + 1, total: ARCHITECTURE_DIAGRAMS.length });
        drawFlowDiagram(doc, SLIDE.margin, y + 6, SLIDE.w - 2 * SLIDE.margin, d.nodes, {
          vertical: true, boxW: 280, boxH: 32, gap: 16, color: COLORS.brand
        });
        slideFooter(doc, 'Agri Funds · Platform Architecture');
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
