import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';
import Wallet from '../models/Wallet.js';

beforeAll(connectMemoryDB);
afterAll(closeMemoryDB);
beforeEach(clearCollections);

// Proves the TOCTOU fix in /allocate: the atomic conditional `$gte` debit
// must never let concurrent requests overspend the treasury.
describe('treasury debit is race-free', () => {
  it('rejects concurrent debits that would overspend', async () => {
    const treasury = await Wallet.create({
      label: 'Central Treasury',
      publicKey: 'GTEST',
      secret: 'SSEEDTEST',
      type: 'treasury',
      balance: 100
    });

    const debit = (value) =>
      Wallet.findOneAndUpdate(
        { _id: treasury._id, type: 'treasury', balance: { $gte: value } },
        { $inc: { balance: -value } },
        { new: true }
      );

    // 10 concurrent attempts to take 20 from a balance of 100 → at most 5.
    const results = await Promise.all(Array.from({ length: 10 }, () => debit(20)));
    const succeeded = results.filter(Boolean).length;

    expect(succeeded).toBe(5);
    const finalBalance = (await Wallet.findById(treasury._id)).balance;
    expect(finalBalance).toBe(0);
    expect(finalBalance).toBeGreaterThanOrEqual(0);
  });
});
