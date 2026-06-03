import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let app, Document;

beforeAll(async () => {
  // Isolate file writes to a temp dir BEFORE the storage adapter loads its key.
  process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-docs-'));
  await connectMemoryDB();
  Document = (await import('../models/Document.js')).default;
  const documents = (await import('../routes/documents.js')).default;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'admin1', role: 'admin' }; next(); });
  app.use('/api/documents', documents);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    res.status(500).json({ error: err.message });
  });
});
afterAll(closeMemoryDB);
beforeEach(clearCollections);

const upload = (fields, content = 'hello') => {
  let req = request(app).post('/api/documents');
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return req.attach('file', Buffer.from(content), { filename: 'doc.pdf', contentType: 'application/pdf' });
};

describe('document management', () => {
  it('uploads a v1 document with metadata', async () => {
    const res = await upload({ title: 'Q1 Invoice', category: 'Invoices', description: 'first' });
    expect(res.status).toBe(201);
    expect(res.body.version).toBe(1);
    expect(res.body.category).toBe('Invoices');
    expect(res.body.rootId).toBe(res.body.id);
    expect(res.body.isLatest).toBe(true);
  });

  it('rejects an unknown category and a missing file', async () => {
    const bad = await upload({ title: 'X', category: 'Nope' });
    expect(bad.status).toBe(400);
    const noFile = await request(app).post('/api/documents').field('title', 'X').field('category', 'Invoices');
    expect(noFile.status).toBe(400);
  });

  it('lists and filters by category, defaulting to active only', async () => {
    await upload({ title: 'Inv', category: 'Invoices' });
    await upload({ title: 'Yield', category: 'Yield Reports' });
    const all = await request(app).get('/api/documents');
    expect(all.body).toHaveLength(2);
    const filtered = await request(app).get('/api/documents?category=Invoices');
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0].title).toBe('Inv');
  });

  it('chains versions and lists full history', async () => {
    const v1 = (await upload({ title: 'Contract', category: 'Buyer Contracts' })).body;
    const v2 = await request(app).post(`/api/documents/${v1.id}/version`)
      .attach('file', Buffer.from('v2'), { filename: 'doc2.pdf', contentType: 'application/pdf' });
    expect(v2.status).toBe(201);
    expect(v2.body.version).toBe(2);
    expect(v2.body.supersedesId).toBe(v1.id);
    expect(v2.body.rootId).toBe(v1.id);

    // Default list shows only the latest head.
    const list = await request(app).get('/api/documents?category=Buyer Contracts');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].version).toBe(2);

    const versions = await request(app).get(`/api/documents/${v1.id}/versions`);
    expect(versions.body).toHaveLength(2);
    expect(versions.body[0].version).toBe(2);
  });

  it('archives a document and hides it from the default list', async () => {
    const doc = (await upload({ title: 'Old', category: 'Invoices' })).body;
    const arch = await request(app).post(`/api/documents/${doc.id}/archive`);
    expect(arch.body.status).toBe('archived');
    const active = await request(app).get('/api/documents');
    expect(active.body).toHaveLength(0);
    const all = await request(app).get('/api/documents?status=all');
    expect(all.body).toHaveLength(1);
  });

  it('downloads the stored file bytes', async () => {
    const doc = (await upload({ title: 'D', category: 'Invoices' }, 'PDF-BYTES')).body;
    const res = await request(app).get(`/api/documents/${doc.id}/download`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.body.toString()).toBe('PDF-BYTES');
  });
});
