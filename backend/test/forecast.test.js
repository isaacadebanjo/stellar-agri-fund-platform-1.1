import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let app, Invoice, Buyer, Distribution;

beforeAll(async () => {
  await connectMemoryDB();
  Invoice = (await import('../models/Invoice.js')).default;
  Buyer = (await import('../models/Buyer.js')).default;
  Distribution = (await import('../models/Distribution.js')).default;
  const forecast = (await import('../routes/forecast.js')).default;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'admin1', role: 'admin' }; next(); });
  app.use('/api/forecast', forecast);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    res.status(500).json({ error: err.message });
  });
});
afterAll(closeMemoryDB);
beforeEach(clearCollections);

describe('treasury forecast', () => {
  it('returns 30/90/365 horizons with series', async () => {
    const res = await request(app).get('/api/forecast/overview');
    expect(res.status).toBe(200);
    expect(res.body.horizons['30']).toBeTruthy();
    expect(res.body.horizons['90']).toBeTruthy();
    expect(res.body.horizons['365']).toBeTruthy();
    expect(Array.isArray(res.body.horizons['90'].series)).toBe(true);
    expect(Array.isArray(res.body.assumptions)).toBe(true);
  });

  it('counts open invoices as expected inflows', async () => {
    const buyer = await Buyer.create({ name: 'B' });
    const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await Invoice.create({ number: 'INV-1', buyerId: buyer._id, amountDue: 5000, amountPaid: 1000, dueDate: soon, status: 'partial' });

    const res = await request(app).get('/api/forecast/overview');
    expect(res.body.horizons['30'].expectedInflows).toBe(4000);
  });

  it('counts pending distributions as outflows', async () => {
    await Distribution.create({ investorId: 'inv1', projectId: 'p1', amount: 2000, sharePercent: 10, status: 'pending' });
    const res = await request(app).get('/api/forecast/overview');
    expect(res.body.horizons['30'].expectedOutflows).toBe(2000);
  });
});
