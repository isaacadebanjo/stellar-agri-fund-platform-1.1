import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let app, Revenue, Transaction, Project;

beforeAll(async () => {
  await connectMemoryDB();
  Revenue = (await import('../models/Revenue.js')).default;
  Transaction = (await import('../models/Transaction.js')).default;
  Project = (await import('../models/Project.js')).default;
  const boardReports = (await import('../routes/boardReports.js')).default;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'admin1', role: 'admin' }; next(); });
  app.use('/api/board-reports', boardReports);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    res.status(500).json({ error: err.message });
  });
});
afterAll(closeMemoryDB);
beforeEach(clearCollections);

async function seedPeriod() {
  const ts = new Date(Date.UTC(2026, 5, 10)); // June 2026
  await Project.create({ _id: 'p1', name: 'Spinach', status: 'active', allocated: 1000, spent: 200, hectares: 5 });
  await Revenue.create({ projectId: 'p1', amount: 500, timestamp: ts });
  await Transaction.create({ stage: 'allocation', status: 'success', amount: 1000, projectId: 'p1', timestamp: ts });
  await Transaction.create({ stage: 'payout', status: 'success', amount: 200, projectId: 'p1', timestamp: ts });
}

describe('board & investor reporting', () => {
  it('builds a monthly report as JSON', async () => {
    await seedPeriod();
    const res = await request(app).get('/api/board-reports/monthly?year=2026&month=6');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('monthly');
    expect(res.body.metrics.revenueGenerated).toBe(500);
    expect(res.body.metrics.capitalDeployed).toBe(1000);
    expect(res.body.metrics.profitGenerated).toBe(300); // 500 revenue - 200 payout
  });

  it('builds a quarterly report with project performance', async () => {
    await seedPeriod();
    const res = await request(app).get('/api/board-reports/quarterly?year=2026&quarter=2');
    expect(res.status).toBe(200);
    expect(res.body.projectPerformance).toHaveLength(1);
    expect(res.body.projectPerformance[0].roiPercent).toBe(30); // profit 300 / allocated 1000
  });

  it('builds a board report snapshot', async () => {
    await seedPeriod();
    const res = await request(app).get('/api/board-reports/board');
    expect(res.status).toBe(200);
    expect(res.body.executiveSummary).toBeTruthy();
    expect(res.body.governanceMetrics).toBeTruthy();
  });

  it('exports PDF and Excel', async () => {
    await seedPeriod();
    const pdf = await request(app).get('/api/board-reports/board?format=pdf');
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/pdf/);
    const xlsx = await request(app).get('/api/board-reports/monthly?format=xlsx&year=2026&month=6');
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toMatch(/spreadsheet/);
  });
});
