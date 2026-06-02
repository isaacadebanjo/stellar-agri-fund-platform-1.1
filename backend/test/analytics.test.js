import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let app, Project, Revenue, Yield, Buyer, OfftakeAgreement, Invoice;

beforeAll(async () => {
  await connectMemoryDB();
  Project = (await import('../models/Project.js')).default;
  Revenue = (await import('../models/Revenue.js')).default;
  Yield = (await import('../models/Yield.js')).default;
  Buyer = (await import('../models/Buyer.js')).default;
  OfftakeAgreement = (await import('../models/OfftakeAgreement.js')).default;
  Invoice = (await import('../models/Invoice.js')).default;

  const yields = (await import('../routes/yields.js')).default;
  const kpi = (await import('../routes/kpi.js')).default;
  const investorConfidence = (await import('../routes/investorConfidence.js')).default;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'admin1', role: 'admin' }; next(); });
  app.use('/api/yields', yields);
  app.use('/api/kpi', kpi);
  app.use('/api/investor-confidence', investorConfidence);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    res.status(500).json({ error: err.message });
  });
});
afterAll(closeMemoryDB);
beforeEach(clearCollections);

describe('Yield reporting', () => {
  it('records yield with variance and reports efficiency', async () => {
    const project = await Project.create({ name: 'Spinach' });
    const res = await request(app).post('/api/yields').send({
      projectId: project._id, cropType: 'Spinach', expectedYield: 100, actualYield: 120, harvestDate: '2026-05-20'
    });
    expect(res.status).toBe(201);
    expect(res.body.yieldVariance).toBe(20);
    expect(res.body.variancePercent).toBe(20);

    const summary = await request(app).get('/api/yields/summary');
    expect(summary.body.efficiencyPercent).toBe(120);
    expect(summary.body.trend).toHaveLength(1);
  });
});

describe('KPI overview', () => {
  it('computes per-hectare and margin metrics', async () => {
    const p = await Project.create({ name: 'Maize', hectares: 10, spent: 200, status: 'active' });
    await Revenue.create({ projectId: p._id, amount: 1000 });
    await Yield.create({ projectId: p._id, actualYield: 500, expectedYield: 400 });

    const res = await request(app).get('/api/kpi/overview');
    expect(res.body.totalHectares).toBe(10);
    expect(res.body.activeProjects).toBe(1);
    expect(res.body.revenuePerHectare).toBe(100);
    expect(res.body.costPerHectare).toBe(20);
    expect(res.body.yieldPerHectare).toBe(50);
    expect(res.body.grossMarginPercent).toBe(80);
    expect(res.body.byProject[0]).toMatchObject({ name: 'Maize', revenue: 1000, cost: 200, profit: 800 });
  });
});

describe('Investor confidence rollup', () => {
  it('aggregates coverage, verification, collection and yield signals', async () => {
    const p = await Project.create({ name: 'Tomato' });
    const buyer = await Buyer.create({ name: 'Acme', verificationStatus: 'verified' });
    await Buyer.create({ name: 'Beta' }); // unverified
    await OfftakeAgreement.create({ agreementNumber: 'OT-1', buyerId: buyer._id, projectId: p._id, quantityCommitted: 100, unitPrice: 5, contractValue: 500, status: 'active' });
    await Invoice.create({ number: 'INV-1', buyerId: buyer._id, amountDue: 100, amountPaid: 50, status: 'partial' });
    await Yield.create({ projectId: p._id, expectedYield: 100, actualYield: 90 });

    const res = await request(app).get('/api/investor-confidence');
    expect(res.body.contractedRevenue).toBe(500);
    expect(res.body.buyerCoveragePercent).toBe(100); // 1 of 1 projects covered
    expect(res.body.buyerVerificationRate).toBe(50);  // 1 of 2 verified
    expect(res.body.paymentCollectionRate).toBe(50);  // 50 of 100
    expect(res.body.yieldPerformancePercent).toBe(90);
    expect(res.body.governanceScore).toBe(Math.round((50 + 50 + 90 + 100) / 4));
  });
});
