import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let app;

beforeAll(async () => {
  await connectMemoryDB();
  const simulator = (await import('../routes/simulator.js')).default;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'u1', role: 'investor' }; next(); });
  app.use('/api/simulator', simulator);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    res.status(500).json({ error: err.message });
  });
});
afterAll(closeMemoryDB);
beforeEach(clearCollections);

describe('ROI simulator', () => {
  it('returns a baseline', async () => {
    const res = await request(app).get('/api/simulator/baseline');
    expect(res.status).toBe(200);
    expect(typeof res.body.suggestedYieldPercent).toBe('number');
    expect(res.body.platformFeePercent).toBe(10);
  });

  it('computes best/expected/worst scenarios', async () => {
    const res = await request(app)
      .post('/api/simulator/roi')
      .send({ investmentAmount: 10000, durationMonths: 12, expectedYieldPercent: 12 });
    expect(res.status).toBe(200);
    expect(res.body.scenarios).toHaveLength(3);
    const expected = res.body.scenarios.find(s => s.key === 'expected');
    // 12% annual on 10000 over 12 months = 1200 gross, less 10% fee = 1080 net.
    expect(expected.projectedRevenue).toBe(1200);
    expect(expected.projectedReturns).toBe(1080);
    expect(expected.projectedRoiPercent).toBe(10.8);
    const best = res.body.scenarios.find(s => s.key === 'best');
    const worst = res.body.scenarios.find(s => s.key === 'worst');
    expect(best.projectedReturns).toBeGreaterThan(expected.projectedReturns);
    expect(worst.projectedReturns).toBeLessThan(expected.projectedReturns);
  });

  it('rejects a non-positive investment amount', async () => {
    const res = await request(app)
      .post('/api/simulator/roi')
      .send({ investmentAmount: 0, durationMonths: 12, expectedYieldPercent: 12 });
    expect(res.status).toBe(400);
  });
});
