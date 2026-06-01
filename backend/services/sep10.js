import { Keypair, Networks, WebAuth, StrKey } from 'stellar-sdk';

// SEP-10 (Stellar Web Authentication) — testnet only.
//
// Lets a non-custodial wallet (Freighter, Albedo, …) prove control of a
// Stellar account without exposing its secret key:
//   1. Server builds a challenge transaction signed by SEP10_SERVER_SECRET.
//   2. The wallet signs that challenge with the user's key.
//   3. Server verifies the user's signature and trusts the public key.
//
// This is an app-internal verifier (not a federated anchor), so the home /
// web-auth domain are just opaque labels both sides agree on. The signature
// math is what matters. Spec: https://stellar.org/protocol/sep-10
//
// Config (all optional — wallet login is simply disabled when unset):
//   SEP10_SERVER_SECRET   Stellar secret seed (S...) that signs challenges.
//                         TESTNET only; keep it distinct from any wallet keys.
//   SEP10_HOME_DOMAIN     Label baked into the challenge. Default below.
//   SEP10_WEB_AUTH_DOMAIN Defaults to SEP10_HOME_DOMAIN.

const HOME_DOMAIN = process.env.SEP10_HOME_DOMAIN || 'agri-funds.testnet';
const WEB_AUTH_DOMAIN = process.env.SEP10_WEB_AUTH_DOMAIN || HOME_DOMAIN;
const CHALLENGE_TIMEOUT_SECONDS = 300;

let cachedServerKeypair = null;

// True when SEP10_SERVER_SECRET is set — gates the wallet-login routes so the
// rest of the app keeps working with the feature off.
export function isWalletAuthEnabled() {
  return Boolean(process.env.SEP10_SERVER_SECRET);
}

function getServerKeypair() {
  if (cachedServerKeypair) return cachedServerKeypair;
  const secret = process.env.SEP10_SERVER_SECRET;
  if (!secret) {
    throw new Error('Wallet login is not configured (SEP10_SERVER_SECRET is not set).');
  }
  if (!StrKey.isValidEd25519SecretSeed(secret)) {
    throw new Error('SEP10_SERVER_SECRET is not a valid Stellar secret seed (S...).');
  }
  cachedServerKeypair = Keypair.fromSecret(secret);
  return cachedServerKeypair;
}

// Build a SEP-10 challenge for the given client public key. The account need
// not exist on testnet yet (a freshly-created wallet works). Returns the
// challenge transaction as a base64 XDR string for the wallet to sign.
export function buildChallenge(clientPublicKey) {
  if (!StrKey.isValidEd25519PublicKey(clientPublicKey)) {
    throw new Error('Invalid Stellar public key.');
  }
  return WebAuth.buildChallengeTx(
    getServerKeypair(),
    clientPublicKey,
    HOME_DOMAIN,
    CHALLENGE_TIMEOUT_SECONDS,
    Networks.TESTNET,
    WEB_AUTH_DOMAIN
  );
}

// Verify a signed challenge. Throws if the signature/structure is invalid or
// expired. Returns the verified client public key on success.
export function verifyChallenge(signedXdr) {
  const serverKeypair = getServerKeypair();
  // readChallengeTx validates structure, server signature, home domain and
  // (crucially) that the challenge hasn't expired; it returns the client key.
  const { clientAccountID } = WebAuth.readChallengeTx(
    signedXdr,
    serverKeypair.publicKey(),
    Networks.TESTNET,
    HOME_DOMAIN,
    WEB_AUTH_DOMAIN
  );
  // Then confirm the client actually signed it. Throws InvalidChallengeError
  // if the expected signer is missing.
  WebAuth.verifyChallengeTxSigners(
    signedXdr,
    serverKeypair.publicKey(),
    Networks.TESTNET,
    [clientAccountID],
    HOME_DOMAIN,
    WEB_AUTH_DOMAIN
  );
  return clientAccountID;
}

export const WALLET_NETWORK = 'stellar-testnet';
