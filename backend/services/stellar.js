import { Keypair } from 'stellar-sdk';

// MVP note: real Stellar testnet submission would call Horizon here.
// For the prototype we generate real keypairs but track balances in our DB,
// so the UI behaves like an on-chain ledger without requiring funding/trustlines.
// Swap `simulateTransfer` for a real `Server.submitTransaction` call when ready.

export function createWallet() {
  const kp = Keypair.random();
  return { publicKey: kp.publicKey(), secret: kp.secret() };
}

export function simulateTransfer({ from, to, amount }) {
  if (amount <= 0) throw new Error('Amount must be positive');
  if (from.balance < amount) throw new Error('Insufficient balance');
  from.balance = +(from.balance - amount).toFixed(2);
  to.balance = +(to.balance + amount).toFixed(2);
  return {
    txHash: 'mock_' + Math.random().toString(36).slice(2, 14),
    asset: 'USDC',
    network: 'stellar-mock'
  };
}
