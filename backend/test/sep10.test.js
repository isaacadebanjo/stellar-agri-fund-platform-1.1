import { describe, it, expect, beforeAll } from 'vitest';
import { Keypair, Networks, TransactionBuilder } from 'stellar-sdk';

// SEP-10 reads SEP10_SERVER_SECRET at first use, so set it before importing.
let sep10;
const serverKp = Keypair.random();

beforeAll(async () => {
  process.env.SEP10_SERVER_SECRET = serverKp.secret();
  sep10 = await import('../services/sep10.js');
});

describe('SEP-10 wallet auth', () => {
  it('reports enabled when the signing secret is set', () => {
    expect(sep10.isWalletAuthEnabled()).toBe(true);
  });

  it('verifies a correctly signed challenge and returns the client key', () => {
    const client = Keypair.random();
    const challenge = sep10.buildChallenge(client.publicKey());

    const tx = TransactionBuilder.fromXDR(challenge, Networks.TESTNET);
    tx.sign(client);

    const verified = sep10.verifyChallenge(tx.toXDR());
    expect(verified).toBe(client.publicKey());
  });

  it('rejects an unsigned challenge', () => {
    const client = Keypair.random();
    const challenge = sep10.buildChallenge(client.publicKey());
    expect(() => sep10.verifyChallenge(challenge)).toThrow();
  });

  it('rejects a challenge signed by the wrong key', () => {
    const client = Keypair.random();
    const attacker = Keypair.random();
    const challenge = sep10.buildChallenge(client.publicKey());

    const tx = TransactionBuilder.fromXDR(challenge, Networks.TESTNET);
    tx.sign(attacker);

    expect(() => sep10.verifyChallenge(tx.toXDR())).toThrow();
  });

  it('rejects an invalid public key when building a challenge', () => {
    expect(() => sep10.buildChallenge('not-a-valid-key')).toThrow();
  });
});
