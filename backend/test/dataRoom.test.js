import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let app, Document, Investor, Distribution;
// Switchable identity so we can exercise admin vs investor scoping.
let currentUser;

beforeAll(async () => {
  process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-dr-'));
  await connectMemoryDB();
  Document = (await import('../models/Document.js')).default;
  Investor = (await import('../models/Investor.js')).default;
  Distribution = (await import('../models/Distribution.js')).default;
  const dataRoom = (await import('../routes/dataRoom.js')).default;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = currentUser; next(); });
  app.use('/api/data-room', dataRoom);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    res.status(500).json({ error: err.message });
  });
});
afterAll(closeMemoryDB);
beforeEach(clearCollections);

async function seed() {
  await Investor.create({ _id: 'inv1', name: 'Alice', walletId: 'w1' });
  await Distribution.create({ investorId: 'inv1', projectId: 'p1', amount: 100, sharePercent: 10 });
  await Document.create({ title: 'Public Gov', category: 'Governance Documents', fileKey: 'k1', investorVisible: true, rootId: 'd1', _id: 'd1' });
  await Document.create({ title: 'Alice Report', category: 'Investor Reports', fileKey: 'k2', relatedInvestorId: 'inv1', rootId: 'd2', _id: 'd2' });
  await Document.create({ title: 'P1 Yield', category: 'Yield Reports', fileKey: 'k3', relatedProjectId: 'p1', rootId: 'd3', _id: 'd3' });
  await Document.create({ title: 'Secret Other', category: 'Invoices', fileKey: 'k4', relatedInvestorId: 'inv2', rootId: 'd4', _id: 'd4' });
}

describe('investor data room scoping', () => {
  it('limits an investor to their own / visible / invested-project documents', async () => {
    await seed();
    currentUser = { id: 'u1', role: 'investor', investorId: 'inv1' };
    const res = await request(app).get('/api/data-room/documents');
    const titles = res.body.map(d => d.title).sort();
    expect(titles).toEqual(['Alice Report', 'P1 Yield', 'Public Gov']);
    expect(titles).not.toContain('Secret Other');
  });

  it('lets an admin see every document', async () => {
    await seed();
    currentUser = { id: 'admin1', role: 'admin' };
    const res = await request(app).get('/api/data-room/documents');
    expect(res.body).toHaveLength(4);
  });

  it('returns scoped dashboard cards for an investor', async () => {
    await seed();
    currentUser = { id: 'u1', role: 'investor', investorId: 'inv1' };
    const res = await request(app).get('/api/data-room/overview');
    expect(res.status).toBe(200);
    expect(res.body.cards.totalReturns).toBe(100);
    expect(res.body.cards.documentsAvailable).toBe(3);
    expect(res.body.sections).toHaveLength(10);
  });

  it('blocks an investor account with no linked profile', async () => {
    currentUser = { id: 'u9', role: 'investor', investorId: null };
    const res = await request(app).get('/api/data-room/overview');
    expect(res.status).toBe(403);
  });
});
