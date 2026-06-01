import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { WALLETS, freighterAvailable, lastWalletProvider, shortKey } from '../wallet.js';
import { ErrorBanner } from './ui.jsx';
import { IconWallet, IconLogout } from './icons.jsx';

// Small "Stellar testnet" pill reused in both views.
function TestnetPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      Stellar testnet
    </span>
  );
}

/**
 * Wallet connect panel for the login screen. Lets an investor sign in with a
 * non-custodial Stellar wallet (Freighter or Albedo) via SEP-10 — no password,
 * no custodial seed. On success the auth state updates and the app re-renders.
 */
export default function ConnectWallet() {
  const { loginWithWallet } = useAuth();
  const [busy, setBusy] = useState(null); // provider id currently connecting
  const [err, setErr] = useState('');
  const [hasFreighter, setHasFreighter] = useState(true);
  const last = lastWalletProvider();

  useEffect(() => {
    let alive = true;
    freighterAvailable().then(v => { if (alive) setHasFreighter(v); });
    return () => { alive = false; };
  }, []);

  async function connect(id) {
    setErr('');
    setBusy(id);
    try {
      await loginWithWallet(id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
          Or connect a wallet
        </div>
        <TestnetPill />
      </div>

      <div className="space-y-1.5">
        {Object.values(WALLETS).map(w => {
          const connecting = busy === w.id;
          const disabled = Boolean(busy);
          const needsInstall = w.id === 'freighter' && !hasFreighter;
          return (
            <button
              key={w.id}
              type="button"
              disabled={disabled}
              onClick={() => connect(w.id)}
              className="w-full flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 text-left hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span className="flex items-center gap-2.5">
                <IconWallet className="h-4 w-4 text-brand-700" />
                <span>
                  <span className="block text-sm font-medium text-slate-900">{w.label}</span>
                  <span className="block text-xs text-slate-500">
                    {needsInstall ? 'Not detected — opens freighter.app' : w.hint}
                    {last === w.id && !connecting ? ' · last used' : ''}
                  </span>
                </span>
              </span>
              <span className="text-xs font-medium text-brand-700">
                {connecting ? 'Connecting…' : 'Connect'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2"><ErrorBanner>{err}</ErrorBanner></div>
    </div>
  );
}

/**
 * Compact connected-wallet badge for the app header. Renders only for wallet
 * (non-custodial) sessions and shows the public key + a Disconnect action.
 */
export function WalletBadge() {
  const { user, logout } = useAuth();
  if (!user || user.authType !== 'wallet' || !user.stellarPublicKey) return null;
  const pk = user.stellarPublicKey;
  return (
    <span
      title={`Connected: ${pk} (Stellar testnet)`}
      className="hidden sm:inline-flex items-center gap-2 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200"
    >
      <IconWallet className="h-3.5 w-3.5 text-brand-700" />
      <span className="font-mono">{shortKey(pk)}</span>
      <button
        onClick={logout}
        title="Disconnect wallet"
        className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700"
      >
        <IconLogout className="h-3.5 w-3.5" />
        Disconnect
      </button>
    </span>
  );
}
