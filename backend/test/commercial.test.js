import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let app, Project, OfftakeAgreement;

beforeAll(async () => {
  await connectMemoryDB();
  Project = (await import('../models/Project.js')).default;
  OfftakeAgreement = (await import('../models/OfftakeAgreement.js')).default;
  await OfftakeAgreement.init(); // ensure the unique agreementNumber index exists

  const buyers = (await import('../routes/buyers.js')).default;
  const offtake = (await import('../routes/offtake.js')).default;
  const deliveries = (await import('../routes/deliveries.js')).default;
  const invoices = (await import('../routes/invoices.js')).default;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'admin1', role: 'admin' }; next(); });
  app.use('/api/buyers', buyers);
  app.use('/api/offtake', offtake);
  app.use('/api/deliveries', deliveries);
  app.use('/api/invoices', invoices);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    res.status(500).json({ error: err.message });
  });
});
afterAll(closeMemoryDB);
beforeEach(clearCollections);

async function makeBuyer(over = {}) {
  return (await request(app).post('/api/buyers').send({ name: 'Acme Foods', ...over })).body;
}

describe('Buyers', () => {
  it('creates, lists, and summarizes buyers', async () => {
    await makeBuyer({ verificationStatus: 'verified' });
    await makeBuyer({ name: 'Beta Traders' });

    const list = await request(app).get('/api/buyers');
    expect(list.body).toHaveLength(2);

    const summary = await request(app).get('/api/buyers/summary');
    expect(summary.body.activeBuyers).toBe(2);
    expect(summary.body.verifiedBuyers).toBe(1);
  });

  it('rejects missing name and invalid email with 400', async () => {
    expect((await request(app).post('/api/buyers').send({})).status).toBe(400);
    expect((await request(app).post('/api/buyers').send({ name: 'X', email: 'nope' })).status).toBe(400);
  });

  it('archives a buyer (hidden from default list)', async () => {
    const b = await makeBuyer();
    await request(app).post(`/api/buyers/${b.id}/archive`);
    const list = await request(app).get('/api/buyers');
    expect(list.body).toHaveLength(0);
  });
});

describe('Offtake agreements', () => {
  it('computes contract value and contracted-revenue summary', async () => {
    const buyer = await makeBuyer();
    const project = await Project.create({ name: 'Spinach' });

    const res = await request(app).post('/api/offtake').send({
      agreementNumber: 'OT-1', buyerId: buyer.id, projectId: project._id,
      crop: 'Spinach', quantityCommitted: 1000, unitPrice: 2.5
    });
    expect(res.status).toBe(201);
    expect(res.body.contractValue).toBe(2500);
    expect(res.body.buyerName).toBe('Acme Foods');

    const summary = await request(app).get('/api/offtake/summary');
    expect(summary.body.totalContractedRevenue).toBe(2500);
    expect(summary.body.totalContractedVolume).toBe(1000);
  });

  it('rejects a duplicate agreement number with 409', async () => {
    const buyer = await makeBuyer();
    const project = await Project.create({ name: 'Maize' });
    const body = { agreementNumber: 'OT-DUP', buyerId: buyer.id, projectId: project._id, quantityCommitted: 1, unitPrice: 1 };
    expect((await request(app).post('/api/offtake').send(body)).status).toBe(201);
    expect((await request(app).post('/api/offtake').send(body)).status).toBe(409);
  });
});

describe('Deliveries', () => {
  it('records a delivery and reports revenue generated', async () => {
    const buyer = await makeBuyer();
    const res = await request(app).post('/api/deliveries').send({
      buyerId: buyer.id, quantityDelivered: 500, unitPrice: 2, paymentStatus: 'paid'
    });
    expect(res.status).toBe(201);
    expect(res.body.invoiceAmount).toBe(1000);

    const summary = await request(app).get('/api/deliveries/summary');
    expect(summary.body.revenueGenerated).toBe(1000);
    expect(summary.body.revenueCollected).toBe(1000);
  });
});

describe('Invoices / payment cycle', () => {
  it('issues an invoice, marks it paid, and updates collection metrics', async () => {
    const buyer = await makeBuyer();
    const created = await request(app).post('/api/invoices').send({
      buyerId: buyer.id, amountDue: 800, issuedDate: '2026-05-01', dueDate: '2026-05-15'
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('unpaid');
    expect(created.body.number).toMatch(/^INV-/);

    const paid = await request(app).patch(`/api/invoices/${created.body.id}`).send({ amountPaid: 800, paidDate: '2026-05-10' });
    expect(paid.body.status).toBe('paid');

    const summary = await request(app).get('/api/invoices/summary');
    expect(summary.body.collectionRatePercent).toBe(100);
    expect(summary.body.avgPaymentCycleDays).toBe(9); // 2026-05-01 → 2026-05-10
  });

  it('flags overdue invoices', async () => {
    const buyer = await makeBuyer();
    await request(app).post('/api/invoices').send({ buyerId: buyer.id, amountDue: 100, issuedDate: '2020-01-01', dueDate: '2020-01-15' });
    const summary = await request(app).get('/api/invoices/summary');
    expect(summary.body.overdueCount).toBe(1);
  });
});
