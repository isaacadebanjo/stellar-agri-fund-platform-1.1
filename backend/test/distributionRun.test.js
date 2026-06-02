import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';
import DistributionRun from '../models/DistributionRun.js';

beforeAll(async () => {
  await connectMemoryDB();
  // Ensure the unique (projectId, periodStart, periodEnd) index is built before
  // we rely on it (autoIndex builds are async otherwise).
  await DistributionRun.init();
});
afterAll(closeMemoryDB);
beforeEach(clearCollections);

// Proves the duplicate-distribution guard: a second run for the same project +
// period is rejected at the DB level (the route turns this 11000 into a 409).
describe('DistributionRun duplicate guard', () => {
  const period = {
    periodStart: new Date('2026-05-01T00:00:00.000Z'),
    periodEnd: new Date('2026-05-31T00:00:00.000Z')
  };

  it('blocks a second run for the same project and period', async () => {
    await DistributionRun.create({ projectId: 'proj1', ...period });

    let code;
    try {
      await DistributionRun.create({ projectId: 'proj1', ...period });
    } catch (e) {
      code = e.code;
    }
    expect(code).toBe(11000);
  });

  it('allows a different period for the same project', async () => {
    await DistributionRun.create({ projectId: 'proj1', ...period });
    const other = await DistributionRun.create({
      projectId: 'proj1',
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-06-30T00:00:00.000Z')
    });
    expect(other._id).toBeTruthy();
  });

  it('allows the same period for a different project', async () => {
    await DistributionRun.create({ projectId: 'proj1', ...period });
    const other = await DistributionRun.create({ projectId: 'proj2', ...period });
    expect(other._id).toBeTruthy();
  });
});
