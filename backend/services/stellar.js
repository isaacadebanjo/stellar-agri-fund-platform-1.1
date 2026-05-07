import {
  Horizon,
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  NotFoundError
} from 'stellar-sdk';

// All network ops target Stellar testnet by default. Override with
// STELLAR_HORIZON_URL if you ever need to swap the Horizon endpoint
// (still testnet — there is no mainnet support in this app).
const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;
// 1000 stroops = 0.0001 XLM. Higher than BASE_FEE (100) for better acceptance
// when Horizon is busy. Still negligible on testnet.
const FEE = String(Math.max(Number(BASE_FEE) * 10, 1000));

const server = new Horizon.Server(HORIZON_URL);

export const ASSET = 'XLM';
export const NETWORK = 'stellar-testnet';

// Generate a Stellar keypair without funding it. Used as a building block.
export function createWallet() {
  const kp = Keypair.random();
  return { publicKey: kp.publicKey(), secret: kp.secret() };
}

// Generate a keypair AND fund it via Friendbot so it exists on-network.
// Returns the keypair plus the live XLM balance after funding (~10000 XLM).
export async function createFundedWallet() {
  const kp = Keypair.random();
  await server.friendbot(kp.publicKey()).call();
  const balance = await getLiveBalance(kp.publicKey());
  return {
    publicKey: kp.publicKey(),
    secret: kp.secret(),
    balance
  };
}

// Friendbot a key that already exists in our DB but isn't yet on the testnet
// (e.g. wallets created before we wired up real Stellar). Idempotent.
export async function fundIfMissing(publicKey) {
  try {
    await server.loadAccount(publicKey);
    return { funded: false, alreadyOnNetwork: true };
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
    await server.friendbot(publicKey).call();
    return { funded: true, alreadyOnNetwork: false };
  }
}

// Live XLM balance from Horizon. 0 if the account isn't on the network yet.
export async function getLiveBalance(publicKey) {
  try {
    const account = await server.loadAccount(publicKey);
    const xlm = account.balances.find(b => b.asset_type === 'native');
    return parseFloat(xlm?.balance || '0');
  } catch (e) {
    if (e instanceof NotFoundError) return 0;
    throw e;
  }
}

// Submit a real testnet payment from `fromSecret` to `toPublicKey`.
// Returns { txHash, ledger, status, asset, network }.
export async function transferXLM({ fromSecret, toPublicKey, amount }) {
  if (!(amount > 0)) throw new Error('Amount must be positive');

  const sourceKp = Keypair.fromSecret(fromSecret);
  const sourceAccount = await server.loadAccount(sourceKp.publicKey());

  const tx = new TransactionBuilder(sourceAccount, {
    fee: FEE,
    networkPassphrase: NETWORK_PASSPHRASE
  })
    .addOperation(Operation.payment({
      destination: toPublicKey,
      asset: Asset.native(),
      amount: String(amount)
    }))
    .setTimeout(60)
    .build();

  tx.sign(sourceKp);

  try {
    const result = await server.submitTransaction(tx);
    return {
      txHash: result.hash,
      ledger: result.ledger,
      status: 'success',
      asset: ASSET,
      network: NETWORK
    };
  } catch (e) {
    // Stellar Horizon returns rich error info — surface a useful message.
    const detail = e?.response?.data?.extras?.result_codes;
    const op = detail?.operations?.[0];
    const code = op || detail?.transaction || e.message;
    const friendly = friendlyStellarError(code);
    const wrapped = new Error(`Stellar transfer failed: ${friendly}`);
    wrapped.code = code;
    wrapped.status = 'failed';
    throw wrapped;
  }
}

function friendlyStellarError(code) {
  switch (code) {
    case 'op_underfunded':       return 'sender does not have enough XLM (after reserves)';
    case 'op_no_destination':    return 'destination account does not exist on testnet';
    case 'op_low_reserve':       return 'destination would fall below minimum reserve';
    case 'op_malformed':         return 'malformed payment operation';
    case 'tx_bad_seq':           return 'sequence number conflict — please retry';
    case 'tx_bad_auth':          return 'bad signature on transaction';
    case 'tx_insufficient_fee':  return 'fee too low for current network conditions';
    case 'tx_too_late':          return 'transaction timed out before submission';
    default: return code || 'unknown error';
  }
}

// Backwards-compat shim — old code called simulateTransfer synchronously and
// mutated balance fields directly. Real Stellar transfers can't be made sync,
// so callers must `await transferXLM` instead. This export is kept as a clear
// error so any leftover callsite fails loudly instead of silently no-oping.
export function simulateTransfer() {
  throw new Error('simulateTransfer was removed — use transferXLM (real testnet) instead.');
}
