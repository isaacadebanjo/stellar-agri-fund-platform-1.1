// Investment Committee Assistant.
//
// PRIMARY PATH is fully deterministic: it answers the committee's questions by
// composing the live metrics snapshot (treasury, risk, KPI, governance,
// forecasting, reporting) into executive summaries — no external API, no data
// egress, reliable for a live demo.
//
// OPTIONAL ENHANCEMENT: if ANTHROPIC_API_KEY is set, the deterministic answer +
// a trimmed snapshot are sent to the Anthropic Messages API (via Node's built-in
// fetch — no SDK dependency) to produce a more fluent natural-language briefing.
// If the key is absent or the call fails, we silently return the deterministic
// answer. Nothing about the deterministic path depends on the key.
/* global fetch, AbortController */
import { fmtXLM } from './reportFormat.js';

export function assistantStatus() {
  return {
    llmEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'
  };
}

// Suggested prompts surfaced in the UI.
export const SUGGESTED_PROMPTS = [
  'Summarize project performance',
  'What are the biggest risks?',
  'Show delayed payments',
  'Which projects need attention?',
  'Explain treasury health',
  'Summarize investor returns',
  'Show buyer concentration risk',
  'Generate investment committee summary',
  'Generate board report',
  'Generate executive briefing'
];

// --- Intent detection (keyword based) -------------------------------------
const INTENTS = [
  { id: 'project_performance', kw: ['project performance', 'summarize project', 'projects performing', 'project summary'] },
  { id: 'biggest_risks', kw: ['biggest risk', 'top risk', 'what are the risks', 'risk summary', 'risks'] },
  { id: 'delayed_payments', kw: ['delayed payment', 'overdue', 'late payment', 'payment delay'] },
  { id: 'attention', kw: ['need attention', 'needs attention', 'underperform', 'attention'] },
  { id: 'treasury_health', kw: ['treasury health', 'treasury', 'liquidity'] },
  { id: 'investor_returns', kw: ['investor return', 'returns', 'roi', 'distribution'] },
  { id: 'buyer_concentration', kw: ['buyer concentration', 'concentration', 'counterparty'] },
  { id: 'ic_summary', kw: ['investment committee', 'committee summary', 'ic summary'] },
  { id: 'board_report', kw: ['board report', 'board pack', 'board'] },
  { id: 'exec_briefing', kw: ['executive briefing', 'executive summary', 'briefing', 'overview'] }
];

function detectIntent(prompt) {
  const p = (prompt || '').toLowerCase();
  for (const intent of INTENTS) {
    if (intent.kw.some(k => p.includes(k))) return intent.id;
  }
  return 'exec_briefing'; // sensible default
}

// --- Deterministic answer builders ----------------------------------------
const pct = (n) => `${n ?? 0}%`;

function buildAnswer(intent, snap) {
  const t = snap.treasury, k = snap.kpi, r = snap.risk, g = snap.governance;
  const c = r.categories || {};

  switch (intent) {
    case 'project_performance': {
      const rows = (k.byProject || []).slice().sort((a, b) => b.profit - a.profit);
      const lines = rows.map(p => `${p.name}: revenue ${fmtXLM(p.revenue)}, cost ${fmtXLM(p.cost)}, profit ${fmtXLM(p.profit)} (${p.actualYield} ${''}yield).`);
      const top = rows[0], bottom = rows[rows.length - 1];
      return {
        title: 'Project Performance',
        text: `Across ${k.projectCount} project(s) (${k.activeProjects} active), total revenue is ${fmtXLM(k.totalRevenue)} against ${fmtXLM(k.totalCost)} cost — a gross margin of ${pct(k.grossMarginPercent)}.` +
          (top ? ` Best performer: ${top.name} (${fmtXLM(top.profit)} profit).` : '') +
          (bottom && rows.length > 1 ? ` Weakest: ${bottom.name} (${fmtXLM(bottom.profit)} profit).` : ''),
        sections: [{ heading: 'By project', lines }]
      };
    }
    case 'biggest_risks': {
      const ranked = [
        ['Liquidity', c.liquidityRisk], ['Payment delay', c.paymentDelayRisk], ['Operational', c.operationalRisk],
        ['Buyer concentration', c.buyerConcentration], ['Revenue concentration', c.revenueConcentration], ['Project concentration', c.projectConcentration]
      ].map(([label, cat]) => ({ label, score: cat?.score ?? 0, level: cat?.level ?? 'low' }))
        .sort((a, b) => b.score - a.score);
      return {
        title: 'Biggest Risks',
        text: `Overall risk is ${r.overallRiskScore}/100 (${r.overallRiskLevel}). The largest exposures are ${ranked.slice(0, 3).map(x => `${x.label} (${x.score}/100, ${x.level})`).join(', ')}.`,
        sections: [
          { heading: 'Ranked risk categories', lines: ranked.map(x => `${x.label}: ${x.score}/100 (${x.level})`) },
          ...(snap.riskIndicators?.length ? [{ heading: 'Active indicators', lines: snap.riskIndicators.map(ri => `[${(ri.level || '').toUpperCase()}] ${ri.label}`) }] : [])
        ]
      };
    }
    case 'delayed_payments': {
      const pd = c.paymentDelayRisk || {};
      return {
        title: 'Delayed Payments',
        text: `There are ${pd.overdueCount ?? 0} overdue invoice(s) totalling ${fmtXLM(pd.overdueAmount ?? 0)} against ${fmtXLM(pd.outstanding ?? 0)} outstanding, averaging ~${pd.avgDaysOverdue ?? 0} days overdue. Payment-delay risk is ${pd.score ?? 0}/100 (${pd.level ?? 'low'}).`,
        sections: [{ heading: 'Receivables', lines: [
          `Outstanding receivables: ${fmtXLM(pd.outstanding ?? 0)}`,
          `Overdue amount: ${fmtXLM(pd.overdueAmount ?? 0)} across ${pd.overdueCount ?? 0} invoice(s)`,
          `Outstanding payments (board): ${fmtXLM(snap.board?.financialMetrics?.outstandingPayments ?? 0)}`
        ] }]
      };
    }
    case 'attention': {
      const weak = (k.byProject || []).filter(p => p.profit <= 0);
      const lines = (weak.length ? weak : (k.byProject || []).slice().sort((a, b) => a.profit - b.profit).slice(0, 2))
        .map(p => `${p.name}: profit ${fmtXLM(p.profit)} (revenue ${fmtXLM(p.revenue)}).`);
      return {
        title: 'Projects Needing Attention',
        text: weak.length
          ? `${weak.length} project(s) are at or below break-even and need attention.`
          : `No project is below break-even; the weakest by profit are listed below. Overall risk is ${r.overallRiskLevel}.`,
        sections: [
          { heading: 'Focus list', lines: lines.length ? lines : ['No projects recorded yet.'] },
          ...(snap.riskIndicators?.length ? [{ heading: 'Risk indicators', lines: snap.riskIndicators.map(ri => ri.label) }] : [])
        ]
      };
    }
    case 'treasury_health':
      return {
        title: 'Treasury Health',
        text: `Treasury balance is ${fmtXLM(t.treasuryBalance)} with ${fmtXLM(t.availableLiquidity)} available liquidity — rated ${t.liquidityHealth}. Capital utilization is ${pct(t.capitalUtilizationPercent)} and the net platform position is ${fmtXLM(t.netPlatformPosition)}.`,
        sections: [{ heading: 'Obligations & forecast', lines: [
          `Pending payouts: ${fmtXLM(t.pendingPayouts)}`,
          `Pending distributions: ${fmtXLM(t.pendingDistributions)}`,
          ...(snap.forecast?.horizons?.['90'] ? [`90-day projected ending balance: ${fmtXLM(snap.forecast.horizons['90'].endingBalance)}`] : [])
        ] }]
      };
    case 'investor_returns':
      return {
        title: 'Investor Returns',
        text: `Realised investor ROI is ${pct(k.investorRoiPercent)} — ${fmtXLM(k.totalDistributed)} distributed on ${fmtXLM(k.totalInvested)} invested. Gross margin is ${pct(k.grossMarginPercent)} and profit margin ${pct(k.profitMarginPercent)}.`,
        sections: [{ heading: 'Returns detail', lines: [
          `Total invested: ${fmtXLM(k.totalInvested)}`,
          `Total distributed: ${fmtXLM(k.totalDistributed)}`,
          `Net profit: ${fmtXLM(k.netProfit)}`
        ] }]
      };
    case 'buyer_concentration': {
      const bc = c.buyerConcentration || {};
      return {
        title: 'Buyer Concentration Risk',
        text: `Buyer concentration scores ${bc.score ?? 0}/100 (${bc.level ?? 'low'}); the largest buyer accounts for ${pct(bc.topShare)} of contracted value across ${bc.count ?? 0} counterparties.`,
        sections: [{ heading: 'Top exposures', lines: (bc.breakdown || []).slice(0, 5).map(b => `${b.label}: ${pct(b.sharePercent)}`) }]
      };
    }
    case 'ic_summary':
    case 'board_report':
    case 'exec_briefing':
    default:
      return {
        title: intent === 'board_report' ? 'Board Report Summary' : intent === 'ic_summary' ? 'Investment Committee Summary' : 'Executive Briefing',
        text: `${snap.org.name} is rated ${snap.scores.readinessBand} (${snap.scores.investmentReadinessScore}/100). ${fmtXLM(t.totalAllocatedCapital)} is deployed across ${k.activeProjects} active project(s), generating ${fmtXLM(t.totalRevenue)} revenue at ${pct(k.grossMarginPercent)} gross margin and ${pct(k.investorRoiPercent)} realised ROI. Treasury liquidity is ${t.liquidityHealth}; overall risk is ${r.overallRiskScore}/100 (${r.overallRiskLevel}).`,
        sections: [
          { heading: 'Capital', lines: [`Invested ${fmtXLM(t.totalInvestedCapital)}`, `Deployed ${fmtXLM(t.totalAllocatedCapital)}`, `Distributed ${fmtXLM(k.totalDistributed)}`] },
          { heading: 'Governance', lines: [`${g.pendingApprovals ?? 0} pending approval(s)`, `Milestone completion ${pct(g.milestoneCompletionRate)}`, `Buyer verification ${pct(g.buyerVerificationRate)}`] },
          { heading: 'Risk', lines: (snap.riskIndicators || []).map(ri => `[${(ri.level || '').toUpperCase()}] ${ri.label}`) }
        ]
      };
  }
}

// Render structured answer to plain text (used as LLM context + fallback body).
function answerToText(a) {
  const parts = [a.title, '', a.text];
  for (const s of a.sections || []) {
    if (!s.lines?.length) continue;
    parts.push('', s.heading + ':');
    for (const l of s.lines) parts.push(`  • ${l}`);
  }
  return parts.join('\n');
}

// --- Optional Anthropic enhancement ---------------------------------------
async function enhanceWithLLM(prompt, deterministic, snap) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

  // Trimmed, factual context — only platform-derived numbers, no PII.
  const context = {
    readiness: snap.scores,
    treasury: snap.treasury,
    kpi: { investorRoiPercent: snap.kpi.investorRoiPercent, grossMarginPercent: snap.kpi.grossMarginPercent, totalRevenue: snap.kpi.totalRevenue, totalDistributed: snap.kpi.totalDistributed, byProject: snap.kpi.byProject },
    risk: { overall: snap.risk.overallRiskScore, level: snap.risk.overallRiskLevel, categories: snap.risk.categories },
    governance: snap.governance,
    riskIndicators: snap.riskIndicators
  };

  const system =
    'You are an investment committee analyst for an agricultural investment platform. ' +
    'Use ONLY the numbers in the provided platform data and the deterministic summary. ' +
    'Do NOT invent figures. Be concise, factual and board-appropriate. Prefer short paragraphs and bullet points.';
  const user =
    `Question: ${prompt}\n\n` +
    `Deterministic summary (authoritative):\n${answerToText(deterministic)}\n\n` +
    `Platform data (JSON):\n${JSON.stringify(context)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model, max_tokens: 800, system, messages: [{ role: 'user', content: user }] }),
      signal: controller.signal
    });
    if (!resp.ok) {
      console.warn(`[assistant] Anthropic API returned ${resp.status}; falling back to deterministic.`);
      return null;
    }
    const data = await resp.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return text || null;
  } catch (e) {
    console.warn(`[assistant] LLM enhancement failed (${e.message}); using deterministic answer.`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Main entry. Always returns a deterministic answer; adds an LLM narrative when
// available and requested.
export async function answerQuestion(prompt, snap, { enhance = true } = {}) {
  const intent = detectIntent(prompt);
  const deterministic = buildAnswer(intent, snap);
  const result = {
    intent,
    title: deterministic.title,
    text: deterministic.text,
    sections: deterministic.sections || [],
    source: 'deterministic',
    enhanced: false
  };

  if (enhance && process.env.ANTHROPIC_API_KEY) {
    const narrative = await enhanceWithLLM(prompt, deterministic, snap);
    if (narrative) {
      result.narrative = narrative;
      result.source = 'llm';
      result.enhanced = true;
    }
  }
  return result;
}
