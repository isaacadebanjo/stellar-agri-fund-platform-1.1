import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let Notification, notifyFromActivity, makeApp;

function buildApp(user) {
  const notifications = makeApp;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/notifications', notifications);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(err.httpStatus || 500).json({ error: err.message }));
  return app;
}

beforeAll(async () => {
  await connectMemoryDB();
  Notification = (await import('../models/Notification.js')).default;
  ({ notifyFromActivity } = await import('../services/notify.js'));
  makeApp = (await import('../routes/notifications.js')).default;
});
afterAll(closeMemoryDB);
beforeEach(clearCollections);

describe('notification engine', () => {
  it('fans an investment activity into an admin + per-investor notification', async () => {
    await notifyFromActivity({
      actionType: 'INVESTMENT',
      entityType: 'TRANSACTION',
      entityId: 't1',
      description: 'Investor funded treasury',
      metadata: { investorIds: ['inv1'] }
    });
    const all = await Notification.find().lean();
    expect(all).toHaveLength(2);
    expect(all.some(n => n.audience === 'admin')).toBe(true);
    expect(all.some(n => n.audience === 'investor' && n.investorId === 'inv1')).toBe(true);
  });

  it('ignores non-notable activities', async () => {
    await notifyFromActivity({ actionType: 'LOGIN', entityType: 'SYSTEM', entityId: 's' });
    expect(await Notification.countDocuments()).toBe(0);
  });
});

describe('notification routes', () => {
  it('lists, counts unread, and marks read for an admin', async () => {
    await notifyFromActivity({ actionType: 'PAYOUT', entityType: 'PAYOUT', entityId: 'p1', description: 'paid' });
    const app = buildApp({ id: 'admin1', role: 'admin' });

    let res = await request(app).get('/api/notifications');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].read).toBe(false);
    const id = res.body.data[0].id;

    res = await request(app).get('/api/notifications/unread-count');
    expect(res.body.unread).toBe(1);

    res = await request(app).post(`/api/notifications/${id}/read`);
    expect(res.status).toBe(200);
    expect(res.body.read).toBe(true);

    res = await request(app).get('/api/notifications/unread-count');
    expect(res.body.unread).toBe(0);
  });

  it('scopes investor visibility to their own investorId', async () => {
    await notifyFromActivity({ actionType: 'DISTRIBUTION_PAID', entityType: 'DISTRIBUTION', entityId: 'd1', description: 'paid', metadata: { investorIds: ['invA'] } });
    // invB must not see invA's notification; admin notification is hidden from investors.
    const appB = buildApp({ id: 'uB', role: 'investor', investorId: 'invB' });
    let res = await request(appB).get('/api/notifications');
    expect(res.body.data).toHaveLength(0);

    const appA = buildApp({ id: 'uA', role: 'investor', investorId: 'invA' });
    res = await request(appA).get('/api/notifications');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Distribution Paid');
  });
});
