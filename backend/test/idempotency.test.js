import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';
import { idempotent } from '../middleware/idempotency.js';

beforeAll(connectMemoryDB);
afterAll(closeMemoryDB);
beforeEach(clearCollections);

function makeApp() {
  let calls = 0;
  const app = express();
  app.use(express.json());
  app.post('/pay', idempotent('POST /pay'), (req, res) => {
    calls += 1;
    if (req.body?.fail) return res.status(400).json({ error: 'boom' });
    res.status(201).json({ paid: true, calls });
  });
  return { app, getCalls: () => calls };
}

describe('idempotency middleware', () => {
  it('runs the handler once and replays the cached response', async () => {
    const { app, getCalls } = makeApp();
    const key = 'abc-123';

    const first = await request(app).post('/pay').set('Idempotency-Key', key).send({});
    const replay = await request(app).post('/pay').set('Idempotency-Key', key).send({});

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(getCalls()).toBe(1); // handler executed only once
  });

  it('runs every time when no key is supplied', async () => {
    const { app, getCalls } = makeApp();
    await request(app).post('/pay').send({});
    await request(app).post('/pay').send({});
    expect(getCalls()).toBe(2);
  });

  it('releases the reservation on a failed (non-2xx) response so a retry works', async () => {
    const { app, getCalls } = makeApp();
    const key = 'retry-me';

    const fail = await request(app).post('/pay').set('Idempotency-Key', key).send({ fail: true });
    expect(fail.status).toBe(400);

    const retry = await request(app).post('/pay').set('Idempotency-Key', key).send({});
    expect(retry.status).toBe(201);
    expect(getCalls()).toBe(2); // retried because the failure cleared the key
  });
});
