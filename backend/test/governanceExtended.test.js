import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let app, ApprovalRequest;

beforeAll(async () => {
  await connectMemoryDB();
  ApprovalRequest = (await import('../models/ApprovalRequest.js')).default;
  const { revenueAdjustmentGate, buyerVerificationGate, offtakeApprovalGate } =
    await import('../middleware/governance.js');

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'admin1', role: 'admin' }; next(); });
  app.post('/test/revenue', revenueAdjustmentGate, (req, res) => res.json({ executed: true }));
  app.patch('/test/buyer/:id', buyerVerificationGate, (req, res) => res.json({ executed: true }));
  app.post('/test/offtake', offtakeApprovalGate, (req, res) => res.json({ executed: true }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    res.status(500).json({ error: err.message });
  });
});
afterAll(closeMemoryDB);
beforeEach(async () => {
  await clearCollections();
  delete process.env.GOVERNANCE_REVENUE_ADJUSTMENT_REQUIRES_APPROVAL;
  delete process.env.GOVERNANCE_BUYER_VERIFICATION_REQUIRES_APPROVAL;
  delete process.env.GOVERNANCE_OFFTAKE_APPROVAL_REQUIRES_APPROVAL;
});

describe('extended approval gates (opt-in)', () => {
  it('revenue adjustment executes when flag off, holds when on', async () => {
    const off = await request(app).post('/test/revenue').send({ projectId: 'p1', amount: 100 });
    expect(off.body.executed).toBe(true);

    process.env.GOVERNANCE_REVENUE_ADJUSTMENT_REQUIRES_APPROVAL = 'true';
    const on = await request(app).post('/test/revenue').send({ projectId: 'p1', amount: 100 });
    expect(on.status).toBe(202);
    expect(on.body.pendingApproval).toBe(true);
    expect(await ApprovalRequest.countDocuments({ actionType: 'revenue_adjustment', status: 'pending' })).toBe(1);
  });

  it('buyer verification only gates when status moves to verified', async () => {
    process.env.GOVERNANCE_BUYER_VERIFICATION_REQUIRES_APPROVAL = 'true';
    const notVerifying = await request(app).patch('/test/buyer/b1').send({ name: 'Renamed' });
    expect(notVerifying.body.executed).toBe(true); // not verifying → passes through

    const verifying = await request(app).patch('/test/buyer/b1').send({ verificationStatus: 'verified' });
    expect(verifying.status).toBe(202);
  });

  it('offtake approval holds when flag on', async () => {
    process.env.GOVERNANCE_OFFTAKE_APPROVAL_REQUIRES_APPROVAL = 'true';
    const res = await request(app).post('/test/offtake').send({ agreementNumber: 'A-1', buyerId: 'b1', projectId: 'p1' });
    expect(res.status).toBe(202);
    expect(res.body.pendingApproval).toBe(true);
  });
});
