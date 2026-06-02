import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

process.env.MONEY_RATE_LIMIT_MAX = '1000';

// Mock the Stellar network layer — no real testnet/Horizon/Friendbot calls.
vi.mock('../services/stellar.js', () => ({
  transferXLM: vi.fn(),
  getLiveBalance: vi.fn(),
  createFundedWallet: vi.fn(),
  fundIfMissing: vi.fn(),
  ASSET: 'XLM',
  NETWORK: 'stellar-testnet'
}));

import * as stellar from '../services/stellar.js';

const FARMER_PUBKEY = 'GFARMERWALLETPUBLICKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

let app;
let Wallet, Project, Farmer, Payout, Transaction;

beforeAll(async () => {
  await connectMemoryDB();
  Wallet = (await import('../models/Wallet.js')).default;
  Project = (await import('../models/Project.js')).default;
  Farmer = (await import('../models/Farmer.js')).default;
  Payout = (await import('../models/Payout.js')).default;
  Transaction = (await import('../models/Transaction.js')).default;
  const payouts = (await import('../routes/payouts.js')).default;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'admin1', role: 'admin' }; next(); });
  app.use('/api/payouts', payouts);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    res.status(500).json({ error: err.message });
  });
});
afterAll(closeMemoryDB);

let project, farmer;
beforeEach(async () => {
  await clearCollections();
  stellar.transferXLM.mockReset();
  stellar.getLiveBalance.mockReset().mockResolvedValue(100);
  stellar.fundIfMissing.mockReset().mockResolvedValue({ funded: false });
  stellar.createFundedWallet.mockReset().mockResolvedValue({
    publicKey: FARMER_PUBKEY,
    secret: 'SFARMERSEEDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    balance: 10000
  });

  await Wallet.create({ label: 'Central Treasury', publicKey: 'GTREASURY', secret: 'STREASURYSEED', type: 'treasury', balance: 100000 });
  project = await Project.create({ name: 'Spinach', allocated: 1000, spent: 0 });
  farmer = await Farmer.create({ name: 'Demo Farmer' });
});

const pay = (body) => request(app).post('/api/payouts').send(body);

describe('farmer payout — real testnet transfer', () => {
  it('transfers XLM treasury → farmer wallet and records the tx hash', async () => {
    stellar.transferXLM.mockResolvedValue({ txHash: 'HASH123', ledger: 42, status: 'success', asset: 'XLM', network: 'stellar-testnet' });

    const res = await pay({ projectId: project._id, farmerId: farmer._id, amount: 100 });

    expect(res.status).toBe(201);
    expect(stellar.transferXLM).toHaveBeenCalledTimes(1);
    const arg = stellar.transferXLM.mock.calls[0][0];
    expect(arg.toPublicKey).toBe(FARMER_PUBKEY);
    expect(arg.amount).toBe(100);
    expect(res.body.txHash).toBe('HASH123');
    expect(res.body.status).toBe('success');
    expect(res.body.farmerWallet).toBe(FARMER_PUBKEY);

    // Project allocation debited, farmer wallet provisioned.
    expect((await Project.findById(project._id)).spent).toBe(100);
    expect((await Farmer.findById(farmer._id)).walletId).toBeTruthy();
  });

  it('auto-provisions the farmer wallet once and reuses it', async () => {
    stellar.transferXLM.mockResolvedValue({ txHash: 'H', ledger: 1, status: 'success' });

    await pay({ projectId: project._id, farmerId: farmer._id, amount: 50 });
    const firstWalletId = (await Farmer.findById(farmer._id)).walletId;
    await pay({ projectId: project._id, farmerId: farmer._id, amount: 50 });
    const secondWalletId = (await Farmer.findById(farmer._id)).walletId;

    expect(secondWalletId).toBe(firstWalletId);
    expect(stellar.createFundedWallet).toHaveBeenCalledTimes(1);
  });

  it('compensates (refunds allocation, marks failed) when the transfer is rejected', async () => {
    stellar.transferXLM.mockRejectedValue(Object.assign(new Error('Stellar transfer failed: op_underfunded'), { code: 'op_underfunded' }));

    const res = await pay({ projectId: project._id, farmerId: farmer._id, amount: 100 });

    expect(res.status).toBe(400);
    expect((await Project.findById(project._id)).spent).toBe(0); // refunded
    const payouts = await Payout.find();
    expect(payouts).toHaveLength(1);
    expect(payouts[0].status).toBe('failed');
    const txs = await Transaction.find();
    expect(txs[0].status).toBe('failed');
  });

  it('rejects a payout exceeding the project allocation without transferring', async () => {
    const res = await pay({ projectId: project._id, farmerId: farmer._id, amount: 5000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/insufficient/i);
    expect(stellar.transferXLM).not.toHaveBeenCalled();
  });

  it('rejects an invalid amount with a 400', async () => {
    const res = await pay({ projectId: project._id, farmerId: farmer._id, amount: -10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/amount/);
    expect(stellar.transferXLM).not.toHaveBeenCalled();
  });
});
