import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let app, Buyer, ApprovalRequest, Document, Project;

beforeAll(async () => {
  await connectMemoryDB();
  Buyer = (await import('../models/Buyer.js')).default;
  ApprovalRequest = (await import('../models/ApprovalRequest.js')).default;
  Document = (await import('../models/Document.js')).default;
  Project = (await import('../models/Project.js')).default;
  const executive = (await import('../routes/executive.js')).default;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'admin1', role: 'admin' }; next(); });
  app.use('/api/executive', executive);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    res.status(500).json({ error: err.message });
  });
});
afterAll(closeMemoryDB);
beforeEach(clearCollections);

describe('executive governance dashboard', () => {
  it('returns composite scores and risk alerts', async () => {
    await Project.create({ name: 'P', status: 'active' });
    await Buyer.create({ name: 'B1', verificationStatus: 'verified' });
    await Buyer.create({ name: 'B2', verificationStatus: 'unverified' });
    await ApprovalRequest.create({ key: 'k1', actionType: 'allocation', status: 'pending' });
    await Document.create({ title: 'Gov', category: 'Governance Documents', fileKey: 'k', rootId: 'x', _id: 'x' });

    const res = await request(app).get('/api/executive/overview');
    expect(res.status).toBe(200);
    expect(res.body.pendingApprovals).toBe(1);
    expect(res.body.buyerVerification.rate).toBe(50);
    expect(typeof res.body.investorConfidenceScore).toBe('number');
    expect(typeof res.body.governanceScore).toBe('number');
    expect(typeof res.body.reportingComplianceScore).toBe('number');
    expect(Array.isArray(res.body.riskAlerts)).toBe(true);
    expect(Array.isArray(res.body.trends)).toBe(true);
  });
});
