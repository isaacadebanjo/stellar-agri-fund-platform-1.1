import { describe, it, expect, beforeAll } from 'vitest';

let answerQuestion;

// A minimal but complete snapshot shape for the deterministic engine.
const snap = {
  org: { name: 'Agri Funds', network: 'Stellar testnet' },
  scores: { investmentReadinessScore: 72, readinessBand: 'Developing' },
  treasury: {
    treasuryBalance: 20000, availableLiquidity: 8000, liquidityHealth: 'Healthy',
    capitalUtilizationPercent: 60, netPlatformPosition: 5000, totalInvestedCapital: 19000,
    totalAllocatedCapital: 18000, totalRevenue: 16000, pendingPayouts: 0, pendingDistributions: 1000
  },
  kpi: {
    projectCount: 2, activeProjects: 2, totalRevenue: 16000, totalCost: 8000, grossMarginPercent: 50,
    profitMarginPercent: 40, investorRoiPercent: 12, totalDistributed: 2280, totalInvested: 19000, netProfit: 6000,
    byProject: [
      { name: 'Spinach', revenue: 9000, cost: 5000, profit: 4000, actualYield: 6200 },
      { name: 'Tomato', revenue: 7000, cost: 3000, profit: 4000, actualYield: 4600 }
    ]
  },
  risk: {
    overallRiskScore: 38, overallRiskLevel: 'medium',
    categories: {
      liquidityRisk: { score: 15, level: 'low' },
      paymentDelayRisk: { score: 40, level: 'medium', overdueCount: 1, overdueAmount: 1800, outstanding: 4300, avgDaysOverdue: 20 },
      operationalRisk: { score: 20, level: 'low' },
      buyerConcentration: { score: 60, level: 'medium', topShare: 64, count: 2, breakdown: [{ label: 'BigBasket', sharePercent: 64 }, { label: 'Reliance', sharePercent: 36 }] },
      revenueConcentration: { score: 55, level: 'medium', topShare: 56 },
      projectConcentration: { score: 50, level: 'medium', topShare: 50 }
    }
  },
  governance: { pendingApprovals: 1, milestoneCompletionRate: 67, activeContracts: 2, buyerVerificationRate: 100, verifiedBuyers: 2, totalBuyers: 2 },
  board: { financialMetrics: { outstandingPayments: 2300 } },
  riskIndicators: [{ level: 'medium', label: '1 overdue invoice(s)' }]
};

beforeAll(async () => {
  delete process.env.ANTHROPIC_API_KEY; // ensure deterministic path
  ({ answerQuestion } = await import('../services/assistant.js'));
});

describe('IC assistant (deterministic)', () => {
  it('routes treasury questions and stays deterministic without an API key', async () => {
    const a = await answerQuestion('Explain treasury health', snap);
    expect(a.intent).toBe('treasury_health');
    expect(a.enhanced).toBe(false);
    expect(a.source).toBe('deterministic');
    expect(a.text).toMatch(/Healthy/);
  });

  it('answers buyer concentration with the top exposure', async () => {
    const a = await answerQuestion('Show buyer concentration risk', snap);
    expect(a.intent).toBe('buyer_concentration');
    expect(a.text).toMatch(/64%/);
  });

  it('summarizes biggest risks ranked', async () => {
    const a = await answerQuestion('What are the biggest risks?', snap);
    expect(a.intent).toBe('biggest_risks');
    expect(a.sections[0].lines.length).toBeGreaterThan(0);
  });

  it('flags delayed payments', async () => {
    const a = await answerQuestion('Show delayed payments', snap);
    expect(a.intent).toBe('delayed_payments');
    expect(a.text).toMatch(/overdue/i);
  });

  it('defaults unknown prompts to an executive briefing', async () => {
    const a = await answerQuestion('tell me about the platform', snap);
    expect(['exec_briefing', 'project_performance']).toContain(a.intent);
    expect(a.text.length).toBeGreaterThan(20);
  });
});
