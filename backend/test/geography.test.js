import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let app, Project, Buyer;

function mount(routes) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.user = { id: 'admin1', role: 'admin' }; next(); });
  for (const [path, router] of routes) a.use(path, router);
  // eslint-disable-next-line no-unused-vars
  a.use((err, req, res, next) => res.status(err.httpStatus || 500).json({ error: err.message }));
  return a;
}

beforeAll(async () => {
  await connectMemoryDB();
  Project = (await import('../models/Project.js')).default;
  Buyer = (await import('../models/Buyer.js')).default;
  const geography = (await import('../routes/geography.js')).default;
  const projects = (await import('../routes/projects.js')).default;
  app = mount([['/api/geography', geography], ['/api/projects', projects]]);
});
afterAll(closeMemoryDB);
beforeEach(clearCollections);

describe('multi-country support', () => {
  it('exposes the supported-markets taxonomy', async () => {
    const res = await request(app).get('/api/geography/countries');
    expect(res.status).toBe(200);
    const codes = res.body.countries.map(c => c.code);
    expect(codes).toEqual(expect.arrayContaining(['ZA', 'CM', 'KE', 'NG']));
  });

  it('accepts a valid country on a project and defaults the currency', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'Cape Spinach', country: 'ZA', region: 'Western Cape' });
    expect(res.status).toBe(201);
    expect(res.body.country).toBe('ZA');
    expect(res.body.currency).toBe('ZAR'); // defaulted from taxonomy
    expect(res.body.region).toBe('Western Cape');
  });

  it('rejects an unsupported country code', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'X', country: 'US' });
    expect(res.status).toBe(400);
  });

  it('rolls up the portfolio by country', async () => {
    await Project.create({ name: 'A', country: 'ZA', allocated: 1000, hectares: 5, status: 'active' });
    await Project.create({ name: 'B', country: 'KE', allocated: 500, status: 'active' });
    await Buyer.create({ name: 'Buyer ZA', country: 'ZA' });

    const res = await request(app).get('/api/geography/overview');
    expect(res.status).toBe(200);
    const za = res.body.countries.find(c => c.country === 'ZA');
    expect(za.allocated).toBe(1000);
    expect(za.buyers).toBe(1);
    expect(res.body.totals.countries).toBe(2);
  });
});
