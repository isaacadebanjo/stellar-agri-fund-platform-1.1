import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let seedDemo, resetDemo, getDemoStatus, Investor, Project, Buyer, Farmer, Transaction, Distribution;

beforeAll(async () => {
  await connectMemoryDB();
  ({ seedDemo, resetDemo, getDemoStatus } = await import('../services/demoData.js'));
  Investor = (await import('../models/Investor.js')).default;
  Project = (await import('../models/Project.js')).default;
  Buyer = (await import('../models/Buyer.js')).default;
  Farmer = (await import('../models/Farmer.js')).default;
  Transaction = (await import('../models/Transaction.js')).default;
  Distribution = (await import('../models/Distribution.js')).default;
});
afterAll(closeMemoryDB);
beforeEach(clearCollections);

describe('demo environment generator', () => {
  it('seeds a consistent dataset (no on-chain) with the expected entities', async () => {
    const result = await seedDemo();
    expect(result.ok).toBe(true);
    expect(await Investor.countDocuments()).toBe(3);
    expect(await Project.countDocuments()).toBe(2);
    expect(await Buyer.countDocuments()).toBe(2);
    expect(await Farmer.countDocuments()).toBe(2);
    // investments + allocations + payouts recorded as internal transactions
    expect(await Transaction.countDocuments({ network: 'internal' })).toBeGreaterThanOrEqual(7);
    // one distribution paid
    expect(await Distribution.countDocuments({ status: 'paid' })).toBe(1);
  });

  it('re-seeding is deterministic (resets first)', async () => {
    await seedDemo();
    await seedDemo();
    expect(await Investor.countDocuments()).toBe(3);
    expect(await Buyer.countDocuments()).toBe(2);
  });

  it('reset clears business + ledger data', async () => {
    await seedDemo();
    await resetDemo();
    const status = await getDemoStatus();
    expect(status.counts.investors).toBe(0);
    expect(status.counts.projects).toBe(0);
    expect(status.counts.buyers).toBe(0);
    expect(await Transaction.countDocuments()).toBe(0);
  });
});
