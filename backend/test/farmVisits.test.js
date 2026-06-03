import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let app, Project;

beforeAll(async () => {
  await connectMemoryDB();
  Project = (await import('../models/Project.js')).default;
  const farmVisits = (await import('../routes/farmVisits.js')).default;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'admin1', role: 'admin' }; next(); });
  app.use('/api/farm-visits', farmVisits);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    res.status(500).json({ error: err.message });
  });
});
afterAll(closeMemoryDB);
beforeEach(clearCollections);

describe('farm visits', () => {
  it('rejects a visit for an unknown project', async () => {
    const res = await request(app).post('/api/farm-visits').send({ projectId: 'nope' });
    expect(res.status).toBe(404);
  });

  it('creates a visit, clamps scores, and enriches with project name', async () => {
    const p = await Project.create({ name: 'Spinach Pilot', status: 'active' });
    const res = await request(app).post('/api/farm-visits').send({
      projectId: p._id, inspector: 'A. Field', visitDate: '2026-05-01',
      farmHealthScore: 140, complianceScore: 80, operationalStatus: 'attention',
      gpsLat: -33.92, gpsLng: 18.42, findings: 'irrigation ok'
    });
    expect(res.status).toBe(201);
    expect(res.body.farmHealthScore).toBe(100); // clamped
    expect(res.body.projectName).toBe('Spinach Pilot');
    expect(res.body.operationalStatus).toBe('attention');
  });

  it('rejects an invalid operational status', async () => {
    const p = await Project.create({ name: 'P', status: 'active' });
    const res = await request(app).post('/api/farm-visits').send({ projectId: p._id, operationalStatus: 'exploded' });
    expect(res.status).toBe(400);
  });

  it('summarizes averages and status breakdown', async () => {
    const p = await Project.create({ name: 'P', status: 'active' });
    await request(app).post('/api/farm-visits').send({ projectId: p._id, farmHealthScore: 80, complianceScore: 60, operationalStatus: 'on_track' });
    await request(app).post('/api/farm-visits').send({ projectId: p._id, farmHealthScore: 40, complianceScore: 40, operationalStatus: 'at_risk' });
    const res = await request(app).get('/api/farm-visits/summary');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.avgHealthScore).toBe(60);
    expect(res.body.statusBreakdown.at_risk).toBe(1);
  });
});
