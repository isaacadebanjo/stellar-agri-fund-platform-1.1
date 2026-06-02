import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let app, Project, ApprovalRequest;

beforeAll(async () => {
  await connectMemoryDB();
  Project = (await import('../models/Project.js')).default;
  ApprovalRequest = (await import('../models/ApprovalRequest.js')).default;

  const { allocationGate, milestoneAllocationGate } = await import('../middleware/governance.js');
  const governance = (await import('../routes/governance.js')).default;
  const milestones = (await import('../routes/milestones.js')).default;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'admin1', role: 'admin' }; next(); });
  // Stand-in for the real allocate handler — proves whether the gates let it run.
  app.post('/test/allocate', milestoneAllocationGate, allocationGate, (req, res) => res.json({ executed: true }));
  app.use('/api/governance', governance);
  app.use('/api/milestones', milestones);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    res.status(500).json({ error: err.message });
  });
});
afterAll(closeMemoryDB);
beforeEach(async () => {
  await clearCollections();
  delete process.env.GOVERNANCE_ALLOCATION_THRESHOLD;
  delete process.env.GOVERNANCE_ALLOW_SELF_APPROVE;
});

const allocate = (amount, projectId = 'p1') => request(app).post('/test/allocate').send({ projectId, amount });

describe('governance threshold gate', () => {
  it('executes immediately when no threshold is set (gating off)', async () => {
    const res = await allocate(5000);
    expect(res.status).toBe(200);
    expect(res.body.executed).toBe(true);
  });

  it('executes below threshold, holds for approval above it', async () => {
    process.env.GOVERNANCE_ALLOCATION_THRESHOLD = '1000';

    const below = await allocate(500);
    expect(below.body.executed).toBe(true);

    const above = await allocate(5000);
    expect(above.status).toBe(202);
    expect(above.body.pendingApproval).toBe(true);
    expect(await ApprovalRequest.countDocuments({ status: 'pending' })).toBe(1);
  });

  it('executes after approval, then requires a fresh approval next time', async () => {
    process.env.GOVERNANCE_ALLOCATION_THRESHOLD = '1000';

    const first = await allocate(5000);
    expect(first.status).toBe(202);

    const pending = await request(app).get('/api/governance/pending');
    expect(pending.body).toHaveLength(1);
    await request(app).post(`/api/governance/${pending.body[0].id}/approve`).send({ comments: 'ok' });

    const exec = await allocate(5000); // re-submit consumes the approval
    expect(exec.status).toBe(200);
    expect(exec.body.executed).toBe(true);

    const again = await allocate(5000); // approval already consumed
    expect(again.status).toBe(202);
  });

  it('enforces segregation of duties when self-approve is disabled', async () => {
    process.env.GOVERNANCE_ALLOCATION_THRESHOLD = '1000';
    process.env.GOVERNANCE_ALLOW_SELF_APPROVE = 'false';

    await allocate(5000);
    const pending = await request(app).get('/api/governance/pending');
    const res = await request(app).post(`/api/governance/${pending.body[0].id}/approve`).send({});
    expect(res.status).toBe(403); // submitter (admin1) can't approve own request
  });
});

describe('milestone-based capital release gate', () => {
  it('blocks allocation beyond approved milestone budget, allows within', async () => {
    const project = await Project.create({ name: 'Gated', governanceEnabled: true });

    // No approved milestones yet → any allocation blocked.
    const blocked = await allocate(500, project._id);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatch(/milestone/i);

    // Approve a milestone that releases 1000.
    const m = await request(app).post('/api/milestones').send({ projectId: project._id, title: 'Planting', releaseAmount: 1000 });
    await request(app).post(`/api/milestones/${m.body.id}/approve`);

    const allowed = await allocate(500, project._id);
    expect(allowed.status).toBe(200);
    expect(allowed.body.executed).toBe(true);
  });

  it('does not gate projects with governance disabled', async () => {
    const project = await Project.create({ name: 'Ungated', governanceEnabled: false });
    const res = await allocate(9999, project._id);
    expect(res.body.executed).toBe(true);
  });
});
