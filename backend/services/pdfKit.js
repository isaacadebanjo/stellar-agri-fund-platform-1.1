// Shared low-level drawing helpers for the presentation PDFs (deck, one-pager,
// packs, architecture). Built on pdfkit — the same engine the existing report
// and statement PDFs use, so there's no new dependency. Pure drawing utilities;
// they take a pdfkit `doc` and never touch the DB.
import { fmtXLM } from './reportFormat.js';

export { fmtXLM };

// Brand palette (mirrors the frontend Tailwind brand/emerald + slate tones).
export const COLORS = {
  brand: '#047857',
  brandDark: '#065f46',
  brandLight: '#d1fae5',
  ink: '#0f172a',
  slate: '#475569',
  mute: '#94a3b8',
  line: '#e2e8f0',
  bg: '#f8fafc',
  amber: '#b45309',
  rose: '#b91c1c',
  sky: '#0ea5e9'
};

// Landscape A4 dimensions (pts).
export const SLIDE = { w: 842, h: 595, margin: 56 };

const levelColor = (lvl) => (lvl === 'high' ? COLORS.rose : lvl === 'medium' ? COLORS.amber : COLORS.brand);
export { levelColor };

// A full-bleed slide background with a thin brand top bar.
export function slideBackground(doc) {
  doc.save();
  doc.rect(0, 0, SLIDE.w, SLIDE.h).fill('#ffffff');
  doc.rect(0, 0, SLIDE.w, 6).fill(COLORS.brand);
  doc.restore();
}

// Slide title block. Returns the y just below the header rule.
export function slideHeader(doc, title, subtitle, { index, total } = {}) {
  const x = SLIDE.margin;
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(24).text(title, x, 56, { width: SLIDE.w - 2 * x });
  let y = doc.y + 2;
  if (subtitle) {
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(12).text(subtitle, x, y, { width: SLIDE.w - 2 * x });
    y = doc.y;
  }
  y += 10;
  doc.moveTo(x, y).lineTo(SLIDE.w - x, y).strokeColor(COLORS.line).lineWidth(1).stroke();
  if (index && total) {
    doc.fillColor(COLORS.mute).font('Helvetica').fontSize(9)
      .text(`${index} / ${total}`, SLIDE.w - x - 60, 60, { width: 60, align: 'right' });
  }
  return y + 16;
}

// Footer line on the current page.
export function slideFooter(doc, label) {
  doc.fillColor(COLORS.mute).font('Helvetica').fontSize(8)
    .text(label, SLIDE.margin, SLIDE.h - 30, { width: SLIDE.w - 2 * SLIDE.margin, align: 'center' });
}

// A row of metric cards. items: [{ label, value, sub }]. Lays out across `cols`.
export function metricCards(doc, x, y, width, items, { cols = 3, cardH = 78, gap = 14 } = {}) {
  const cardW = (width - gap * (cols - 1)) / cols;
  items.forEach((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = x + col * (cardW + gap);
    const cy = y + row * (cardH + gap);
    doc.save();
    doc.roundedRect(cx, cy, cardW, cardH, 8).fillColor(COLORS.bg).fill();
    doc.roundedRect(cx, cy, cardW, cardH, 8).strokeColor(COLORS.line).lineWidth(1).stroke();
    doc.fillColor(COLORS.mute).font('Helvetica-Bold').fontSize(8)
      .text(String(it.label).toUpperCase(), cx + 12, cy + 12, { width: cardW - 24 });
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(18)
      .text(String(it.value), cx + 12, cy + 28, { width: cardW - 24 });
    if (it.sub) {
      doc.fillColor(COLORS.slate).font('Helvetica').fontSize(8)
        .text(String(it.sub), cx + 12, cy + 54, { width: cardW - 24 });
    }
    doc.restore();
  });
  const rows = Math.ceil(items.length / cols);
  return y + rows * (cardH + gap);
}

// A bulleted list. Returns the y after the last bullet.
export function bulletList(doc, x, y, width, items, { size = 12, gap = 8, color } = {}) {
  doc.font('Helvetica').fontSize(size);
  for (const item of items) {
    const text = typeof item === 'string' ? item : item.text;
    doc.fillColor(color || COLORS.slate);
    doc.circle(x + 3, y + size / 2 + 1, 2.2).fill(COLORS.brand);
    doc.fillColor(item.color || color || COLORS.slate)
      .text(text, x + 14, y, { width: width - 14 });
    y = doc.y + gap;
  }
  return y;
}

// A simple vertical or horizontal flow diagram of labelled boxes joined by
// arrows. nodes: ["Investor", "Treasury", ...]. Returns the bounding height.
export function drawFlowDiagram(doc, x, y, width, nodes, { vertical = true, boxH = 34, boxW = 220, gap = 22, color = COLORS.brand } = {}) {
  if (vertical) {
    const cx = x + width / 2;
    let cy = y;
    nodes.forEach((label, i) => {
      const bx = cx - boxW / 2;
      doc.save();
      doc.roundedRect(bx, cy, boxW, boxH, 7).fillColor(COLORS.brandLight).fill();
      doc.roundedRect(bx, cy, boxW, boxH, 7).strokeColor(color).lineWidth(1.2).stroke();
      doc.fillColor(COLORS.brandDark).font('Helvetica-Bold').fontSize(11)
        .text(label, bx, cy + boxH / 2 - 7, { width: boxW, align: 'center' });
      doc.restore();
      if (i < nodes.length - 1) {
        const ay = cy + boxH;
        doc.moveTo(cx, ay).lineTo(cx, ay + gap).strokeColor(color).lineWidth(1.4).stroke();
        // arrowhead
        doc.save().fillColor(color)
          .moveTo(cx - 4, ay + gap - 5).lineTo(cx + 4, ay + gap - 5).lineTo(cx, ay + gap).fill().restore();
      }
      cy += boxH + gap;
    });
    return cy - y;
  }
  // horizontal
  const totalW = nodes.length * boxW + (nodes.length - 1) * gap;
  let bx = x + Math.max(0, (width - totalW) / 2);
  const cy = y;
  nodes.forEach((label, i) => {
    doc.save();
    doc.roundedRect(bx, cy, boxW, boxH, 7).fillColor(COLORS.brandLight).fill();
    doc.roundedRect(bx, cy, boxW, boxH, 7).strokeColor(color).lineWidth(1.2).stroke();
    doc.fillColor(COLORS.brandDark).font('Helvetica-Bold').fontSize(11)
      .text(label, bx, cy + boxH / 2 - 7, { width: boxW, align: 'center' });
    doc.restore();
    if (i < nodes.length - 1) {
      const ax = bx + boxW;
      doc.moveTo(ax, cy + boxH / 2).lineTo(ax + gap, cy + boxH / 2).strokeColor(color).lineWidth(1.4).stroke();
      doc.save().fillColor(color)
        .moveTo(ax + gap - 5, cy + boxH / 2 - 4).lineTo(ax + gap - 5, cy + boxH / 2 + 4).lineTo(ax + gap, cy + boxH / 2).fill().restore();
    }
    bx += boxW + gap;
  });
  return boxH;
}

// Vertical bar chart. series: [{ label, value }]. Draws axis baseline + bars +
// value labels. Returns the y below the chart.
export function drawBarChart(doc, x, y, width, height, series, { color = COLORS.brand, valueFmt = (v) => String(v) } = {}) {
  const max = Math.max(1, ...series.map(s => Math.abs(s.value) || 0));
  const n = series.length || 1;
  const slot = width / n;
  const barW = Math.min(60, slot * 0.55);
  const baseY = y + height;
  doc.moveTo(x, baseY).lineTo(x + width, baseY).strokeColor(COLORS.line).lineWidth(1).stroke();
  series.forEach((s, i) => {
    const h = (Math.abs(s.value) / max) * (height - 24);
    const cx = x + i * slot + slot / 2;
    const bx = cx - barW / 2;
    const by = baseY - h;
    doc.save();
    doc.roundedRect(bx, by, barW, h, 3).fillColor(s.color || color).fill();
    doc.restore();
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(8)
      .text(valueFmt(s.value), bx - 8, by - 12, { width: barW + 16, align: 'center' });
    doc.fillColor(COLORS.mute).font('Helvetica').fontSize(8)
      .text(String(s.label), x + i * slot, baseY + 4, { width: slot, align: 'center' });
  });
  return baseY + 20;
}

// A 0–100 score "pill" with a coloured fill proportion. Returns y below.
export function scorePill(doc, x, y, width, label, score, band) {
  const s = Math.max(0, Math.min(100, score || 0));
  const col = s >= 67 ? COLORS.brand : s >= 34 ? COLORS.amber : COLORS.rose;
  doc.fillColor(COLORS.mute).font('Helvetica-Bold').fontSize(9).text(String(label).toUpperCase(), x, y);
  const barY = y + 16;
  doc.roundedRect(x, barY, width, 14, 7).fillColor(COLORS.line).fill();
  doc.roundedRect(x, barY, (width * s) / 100, 14, 7).fillColor(col).fill();
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(12)
    .text(`${s}/100${band ? ` · ${band}` : ''}`, x, barY + 20);
  return barY + 40;
}
