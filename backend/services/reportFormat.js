// Shared formatting for report renderers (PDF + Excel). Amounts are XLM, shown
// with 2dp and a thousands separator, matching the frontend's fmt().
export function fmtXLM(n) {
  const v = Number.isFinite(n) ? n : 0;
  return `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XLM`;
}

// Build a download filename like "Board-Report-2026-06-03.pdf".
export function reportFileName(report, ext) {
  const base = (report.title || 'report').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return `${base}-${date}.${ext}`;
}
