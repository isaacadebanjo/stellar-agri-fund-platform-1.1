import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Keypair, Networks, TransactionBuilder } from 'stellar-sdk';
import express from 'express';
import request from 'supertest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

// SEP-10 + rate-limit config must be set before the modules read them at import.
const serverKp = Keypair.random();
process.env.SEP10_SERVER_SECRET = serverKp.secret();
process.env.WALLET_AUTH_RATE_LIMIT_MAX = '1000';

// Mock the Stellar network layer so onboarding never touches real testnet/Horizon.
vi.mock('../services/stellar.js', () => ({
  fundIfMissing: vi.fn(),
  getLiveBalance: vi.fn(),
  ASSET: 'XLM',
  NETWORK: 'stellar-testnet'
}));

let authRouter;
let sep10;
let stellar;
let Investor;
let User;

beforeAll(async () => {
  await connectMemoryDB();
  sep10 = await import('../services/sep10.js');
  stellar = await import('../services/stellar.js');
  authRouter = (await import('../routes/auth.js')).default;
  Investor = (await import('../models/Investor.js')).default;
  User = (await import('../models/User.js')).default;
});
afterAll(closeMemoryDB);
beforeEach(async () => {
  await clearCollections();
  stellar.fundIfMissing.mockReset();
  stellar.getLiveBalance.mockReset();
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  // Minimal mirror of server.js error handling (honor httpStatus from validators).
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    res.status(500).json({ error: err.message });
  });
  return app;
}

// Build + client-sign a SEP-10 challenge → the signed XDR the wallet would send.
function signedChallenge(clientKp) {
  const xdr = sep10.buildChallenge(clientKp.publicKey());
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
  tx.sign(clientKp);
  return tx.toXDR();
}

const register = (app, body) => request(app).post('/api/auth/wallet/register').send(body);

describe('wallet-first onboarding', () => {
  it('creates a funded non-custodial investor + wallet user', async () => {
    stellar.fundIfMissing.mockResolvedValue({ funded: true });
    stellar.getLiveBalance.mockResolvedValue(10000);

    const app = makeApp();
    const client = Keypair.random();
    const res = await register(app, { transaction: signedChallenge(client), name: 'Alice', email: 'alice@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.investor.custodial).toBe(false);
    expect(res.body.investor.stellarPublicKey).toBe(client.publicKey());
    expect(res.body.investor.name).toBe('Alice');
    expect(res.body.wallet).toMatchObject({ balance: 10000, funded: true, publicKey: client.publicKey() });
    expect(res.body.user.authType).toBe('wallet');
    expect(res.body.token).toBeTruthy();
  });

  it('funds an unfunded wallet via Friendbot', async () => {
    stellar.fundIfMissing.mockResolvedValue({ funded: true });
    stellar.getLiveBalance.mockResolvedValue(10000);

    const app = makeApp();
    const client = Keypair.random();
    const res = await register(app, { transaction: signedChallenge(client), name: 'Carol' });

    expect(stellar.fundIfMissing).toHaveBeenCalledWith(client.publicKey());
    expect(res.body.wallet.funded).toBe(true);
    expect(res.body.wallet.balance).toBe(10000);
  });

  it('is idempotent: a second register returns the existing records, no duplicate', async () => {
    stellar.fundIfMissing.mockResolvedValue({ funded: false });
    stellar.getLiveBalance.mockResolvedValue(10000);

    const app = makeApp();
    const client = Keypair.random();
    const first = await register(app, { transaction: signedChallenge(client), name: 'Bob' });
    const second = await register(app, { transaction: signedChallenge(client), name: 'Bob Renamed' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.investor.id).toBe(first.body.investor.id);
    expect(second.body.investor.name).toBe('Bob'); // existing name preserved
    expect(await Investor.countDocuments({ stellarPublicKey: client.publicKey() })).toBe(1);
    expect(await User.countDocuments({ walletPublicKey: client.publicKey() })).toBe(1);
  });

  it('still creates the account when Friendbot is disabled (best-effort funding)', async () => {
    stellar.fundIfMissing.mockRejectedValue(new Error('Friendbot funding is disabled (STELLAR_FRIENDBOT_ENABLED=false).'));
    stellar.getLiveBalance.mockResolvedValue(0);

    const app = makeApp();
    const client = Keypair.random();
    const res = await register(app, { transaction: signedChallenge(client), name: 'Dan' });

    expect(res.status).toBe(201);
    expect(res.body.wallet.balance).toBe(0);
    expect(res.body.wallet.funded).toBe(false);
    expect(res.body.wallet.fundingError).toMatch(/disabled/);
  });

  it('rejects a missing name with a 400', async () => {
    stellar.fundIfMissing.mockResolvedValue({ funded: true });
    stellar.getLiveBalance.mockResolvedValue(10000);

    const app = makeApp();
    const client = Keypair.random();
    const res = await register(app, { transaction: signedChallenge(client) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });

  it('rejects an invalid email with a 400', async () => {
    const app = makeApp();
    const client = Keypair.random();
    const res = await register(app, { transaction: signedChallenge(client), name: 'X', email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/);
  });

  it('rejects an unsigned challenge with a 401', async () => {
    const app = makeApp();
    const client = Keypair.random();
    const unsigned = sep10.buildChallenge(client.publicKey());
    const res = await register(app, { transaction: unsigned, name: 'X' });
    expect(res.status).toBe(401);
  });

  it('funds the authenticated wallet user via /wallet/fund', async () => {
    stellar.fundIfMissing.mockResolvedValue({ funded: false });
    stellar.getLiveBalance.mockResolvedValue(0);

    const app = makeApp();
    const client = Keypair.random();
    const reg = await register(app, { transaction: signedChallenge(client), name: 'Eve' });
    const token = reg.body.token;

    stellar.fundIfMissing.mockResolvedValue({ funded: true });
    stellar.getLiveBalance.mockResolvedValue(10000);

    const res = await request(app)
      .post('/api/auth/wallet/fund')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ balance: 10000, funded: true, publicKey: client.publicKey() });
  });
});
