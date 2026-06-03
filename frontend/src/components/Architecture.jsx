import React, { useRef } from 'react';
import { api, downloadBlob } from '../api.js';
import { Section, Button, Toolbar } from './ui.jsx';

const DIAGRAMS = [
  { key: 'capital-flow', title: 'Diagram A — Capital Flow', subtitle: 'How investor capital moves end to end',
    nodes: ['Investor', 'Treasury', 'Projects', 'Farmers', 'Revenue', 'Distributions', 'Investor Returns'] },
  { key: 'system-stack', title: 'Diagram B — System Architecture', subtitle: 'Request and settlement path',
    nodes: ['Frontend (React)', 'API (Express)', 'MongoDB', 'Stellar Network'] },
  { key: 'governance-flow', title: 'Diagram C — Governance Flow', subtitle: 'Accountable capital release',
    nodes: ['Governance Layer', 'Approvals', 'Capital Release', 'Audit Logs', 'Reporting'] }
];

const BOX_W = 320, BOX_H = 46, GAP = 30, PAD = 24;

// A vertical flow chart as inline SVG.
function FlowDiagram({ nodes, svgRef }) {
  const width = BOX_W + PAD * 2;
  const height = nodes.length * BOX_H + (nodes.length - 1) * GAP + PAD * 2;
  const cx = width / 2;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width, display: 'block', margin: '0 auto' }}>
      <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,3 L0,6 Z" fill="#047857" />
        </marker>
      </defs>
      {nodes.map((label, i) => {
        const y = PAD + i * (BOX_H + GAP);
        return (
          <g key={i}>
            <rect x={cx - BOX_W / 2} y={y} width={BOX_W} height={BOX_H} rx="9"
              fill="#d1fae5" stroke="#047857" strokeWidth="1.5" />
            <text x={cx} y={y + BOX_H / 2 + 5} textAnchor="middle"
              fontFamily="Inter, Helvetica, sans-serif" fontSize="15" fontWeight="600" fill="#065f46">
              {label}
            </text>
            {i < nodes.length - 1 && (
              <line x1={cx} y1={y + BOX_H} x2={cx} y2={y + BOX_H + GAP - 2}
                stroke="#047857" strokeWidth="2" markerEnd="url(#arrow)" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Serialize an <svg> element to a PNG blob and download it.
function exportSvgPng(svgEl, filename) {
  if (!svgEl) return;
  const xml = new XMLSerializer().serializeToString(svgEl);
  const svg64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
  const img = new Image();
  img.onload = () => {
    const scale = 2; // crisp export
    const vb = svgEl.viewBox.baseVal;
    const canvas = document.createElement('canvas');
    canvas.width = (vb.width || img.width) * scale;
    canvas.height = (vb.height || img.height) * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(b => { if (b) downloadBlob(filename, b); }, 'image/png');
  };
  img.src = svg64;
}

export default function Architecture() {
  const refs = useRef({});
  const stamp = new Date().toISOString().slice(0, 10);

  async function exportAllPdf() {
    try {
      const blob = await api.presentation.architectureBlob();
      downloadBlob(`Agri-Funds-Architecture-${stamp}.pdf`, blob);
    } catch (e) { alert(e.message); }
  }

  return (
    <Section
      title="Architecture"
      subtitle="Auto-generated platform diagrams. Export individual PNGs or the full PDF."
      action={<Button variant="ghost" onClick={exportAllPdf}>Export all (PDF)</Button>}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {DIAGRAMS.map(d => (
          <div key={d.key} className="card p-5">
            <div className="mb-1 text-sm font-semibold text-slate-900">{d.title}</div>
            <div className="mb-3 text-xs text-slate-500">{d.subtitle}</div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
              <FlowDiagram nodes={d.nodes} svgRef={el => (refs.current[d.key] = el)} />
            </div>
            <Toolbar className="mt-3 justify-end">
              <Button variant="ghost" onClick={() => exportSvgPng(refs.current[d.key], `Agri-Funds-${d.key}-${stamp}.png`)}>
                Export PNG
              </Button>
            </Toolbar>
          </div>
        ))}
      </div>
    </Section>
  );
}
