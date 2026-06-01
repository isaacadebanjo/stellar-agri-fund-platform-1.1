// Non-custodial Stellar wallet connectors (Freighter + Albedo), testnet only.
//
// Both libraries are dynamically imported so they're only fetched when the user
// actually clicks "Connect", keeping them out of the initial bundle. We hardcode
// the testnet passphrase rather than pulling in stellar-sdk just for one string.

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const PROVIDER_KEY = 'agri_wallet_provider';

// ----- Freighter (browser extension) --------------------------------------

async function freighter() {
  const mod = await import('@stellar/freighter-api');
  return mod.default || mod;
}

function freighterError(err) {
  const msg = typeof err === 'string' ? err : err?.message || '';
  if (/denied|reject/i.test(msg)) return 'Connection request was declined in Freighter.';
  return msg || 'Freighter request failed.';
}

// True if the Freighter extension is installed and reachable.
export async function freighterAvailable() {
  try {
    const f = await freighter();
    const res = await f.isConnected();
    return Boolean(res?.isConnected);
  } catch {
    return false;
  }
}

async function freighterGetKey() {
  const f = await freighter();
  const conn = await f.isConnected();
  if (!conn?.isConnected) {
    throw new Error('Freighter not detected. Install the extension from freighter.app.');
  }
  const access = await f.requestAccess();
  if (access.error) throw new Error(freighterError(access.error));

  // Enforce testnet — never let a mainnet-configured wallet through.
  const net = await f.getNetworkDetails();
  if (!net.error && net.networkPassphrase && net.networkPassphrase !== TESTNET_PASSPHRASE) {
    throw new Error('Freighter is not on Testnet. Switch it to the Test Net and retry.');
  }
  return access.address;
}

async function freighterSign(xdr, address) {
  const f = await freighter();
  const res = await f.signTransaction(xdr, { networkPassphrase: TESTNET_PASSPHRASE, address });
  if (res.error) throw new Error(freighterError(res.error));
  return res.signedTxXdr;
}

// ----- Albedo (web, no extension) -----------------------------------------

async function albedo() {
  const mod = await import('@albedo-link/intent');
  return mod.default || mod;
}

async function albedoGetKey() {
  const a = await albedo();
  // A fresh token per request defends against intent replay.
  const res = await a.publicKey({ token: `agri-${Date.now()}` });
  if (!res?.pubkey) throw new Error('Albedo did not return a public key.');
  return res.pubkey;
}

async function albedoSign(xdr, pubkey) {
  const a = await albedo();
  const res = await a.tx({ xdr, pubkey, network: 'testnet', submit: false });
  const signed = res?.signed_envelope_xdr;
  if (!signed) throw new Error('Albedo did not return a signed transaction.');
  return signed;
}

// ----- Unified registry ----------------------------------------------------

export const WALLETS = {
  freighter: {
    id: 'freighter',
    label: 'Freighter',
    hint: 'Browser extension',
    getKey: freighterGetKey,
    sign: freighterSign
  },
  albedo: {
    id: 'albedo',
    label: 'Albedo',
    hint: 'Web popup — no install',
    getKey: albedoGetKey,
    sign: albedoSign
  }
};

// Remember the last provider so the UI can hint at reconnection.
export const rememberWalletProvider = (id) => {
  try { localStorage.setItem(PROVIDER_KEY, id); } catch { /* ignore */ }
};
export const lastWalletProvider = () => {
  try { return localStorage.getItem(PROVIDER_KEY); } catch { return null; }
};
export const clearWalletProvider = () => {
  try { localStorage.removeItem(PROVIDER_KEY); } catch { /* ignore */ }
};

// Short, readable form of a Stellar public key for the UI: GABC…WXYZ.
export const shortKey = (pk) => (pk && pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk || '');
