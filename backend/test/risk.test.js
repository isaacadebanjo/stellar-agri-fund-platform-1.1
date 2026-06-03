import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let app, Project, Revenue, Buyer, Invoice;

beforeAll(async () => {
  await connectMemoryDB();
  Project = (await import('../models/Project.js')).default;
  Revenue = (await import('../models/Revenue.js')).default;
  Buyer = (await import('../models/Buyer.js')).default;
  Invoice = (await import('../models/Invoice.js')).default;
  const risk = (await import('../routes/risk.js')).default;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'admin1', role: 'admin' }; next(); });
  app.use('/api/risk', risk);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    res.status(500).json({ error: err.message });
  });
});
afterAll(closeMemoryDB);
beforeEach(clearCollections);

describe('risk overview', () => {
  it('returns a well-formed empty profile with no data', async () => {
    const res = await request(app).get('/api/risk/overview');
    expect(res.status).toBe(200);
    expect(typeof res.body.overallRiskScore).toBe('number');
    expect(['low', 'medium', 'high']).toContain(res.body.overallRiskLevel);
    expect(res.body.categories).toBeTruthy();
    expect(Array.isArray(res.body.heatmap)).toBe(true);
    expect(res.body.heatmap.length).toBe(6);
    expect(Array.isArray(res.body.trends)).toBe(true);
  });

  it('scores concentration high when one counterparty dominates', async () => {
    const p1 = await Project.create({ name: 'P1', status: 'active' });
    const p2 = await Project.create({ name: 'P2', status: 'active' });
    // 95% of revenue on one project → high concentration.
    await Revenue.create({ projectId: p1._id, amount: 9500 });
    await Revenue.create({ projectId: p2._id, amount: 500 });

    const res = await request(app).get('/api/risk/overview');
    expect(res.status).toBe(200);
    const rc = res.body.categories.revenueConcentration;
    expect(rc.topShare).toBeGreaterThan(90);
    expect(rc.level).toBe('high');
    expect(rc.breakdown[0].label).toBe('P1');
  });

  it('flags overdue invoices as payment-delay risk', async () => {
    const buyer = await Buyer.create({ name: 'B' });
    const past = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    await Invoice.create({ number: 'INV-1', buyerId: buyer._id, amountDue: 1000, amountPaid: 0, dueDate: past, status: 'unpaid' });

    const res = await request(app).get('/api/risk/overview');
    const pd = res.body.categories.paymentDelayRisk;
    expect(pd.overdueCount).toBe(1);
    expect(pd.score).toBeGreaterThan(0);
  });
});
