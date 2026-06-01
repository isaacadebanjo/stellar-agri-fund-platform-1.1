import { describe, it, expect, afterEach, vi } from 'vitest';

// stellar.js validates STELLAR_HORIZON_URL and reads the Friendbot flags at
// module load, so each case sets env then re-imports a fresh module instance.

const ORIG_URL = process.env.STELLAR_HORIZON_URL;
const ORIG_FB = process.env.STELLAR_FRIENDBOT_ENABLED;

function restore(name, val) {
  if (val === undefined) delete process.env[name];
  else process.env[name] = val;
}

afterEach(() => {
  restore('STELLAR_HORIZON_URL', ORIG_URL);
  restore('STELLAR_FRIENDBOT_ENABLED', ORIG_FB);
  vi.resetModules();
});

describe('stellar testnet enforcement', () => {
  it('defaults to the testnet network', async () => {
    vi.resetModules();
    delete process.env.STELLAR_HORIZON_URL;
    const mod = await import('../services/stellar.js');
    expect(mod.NETWORK).toBe('stellar-testnet');
  });

  it('refuses to load against a mainnet Horizon URL', async () => {
    vi.resetModules();
    process.env.STELLAR_HORIZON_URL = 'https://horizon.stellar.org';
    await expect(import('../services/stellar.js')).rejects.toThrow(/mainnet/i);
  });

  it('does not call Friendbot when disabled', async () => {
    vi.resetModules();
    delete process.env.STELLAR_HORIZON_URL;
    process.env.STELLAR_FRIENDBOT_ENABLED = 'false';
    const mod = await import('../services/stellar.js');
    await expect(mod.createFundedWallet()).rejects.toThrow(/disabled/i);
  });
});
