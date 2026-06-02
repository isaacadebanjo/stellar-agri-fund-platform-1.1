import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { WALLETS, freighterAvailable, shortKey } from '../wallet.js';
import { Button, Input, Field, ErrorBanner } from './ui.jsx';
import { IconWallet } from './icons.jsx';

// MetaMask-style, wallet-first onboarding for Stellar testnet:
//   connect wallet → sign SEP-10 challenge (proof) → name/email → create account
//   → fund on testnet (Friendbot) → enter the app.
// No secret keys are ever handled here — signing happens inside Freighter/Albedo.
export default function WalletOnboard({ onCancel }) {
  const { connectWalletForRegister, registerWithWallet, fundMyWallet, enterWalletSession } = useAuth();

  const [step, setStep] = useState('choose'); // choose → form → done
  const [busy, setBusy] = useState(null);      // provider id, or true while submitting
  const [err, setErr] = useState('');
  const [hasFreighter, setHasFreighter] = useState(true);

  const [proof, setProof] = useState(null);    // { transaction, publicKey, providerId }
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);  // { user, investor, wallet }

  useEffect(() => {
    let alive = true;
    freighterAvailable().then(v => { if (alive) setHasFreighter(v); });
    return () => { alive = false; };
  }, []);

  async function connect(id) {
    setErr('');
    setBusy(id);
    try {
      const p = await connectWalletForRegister(id);
      setProof(p);
      setStep('form');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr('Please enter your name.'); return; }
    setErr('');
    setBusy(true);
    try {
      const res = await registerWithWallet({
        transaction: proof.transaction,
        name: name.trim(),
        email: email.trim()
      });
      setResult(res);
      setStep('done');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function fund() {
    setErr('');
    setBusy(true);
    try {
      const r = await fundMyWallet();
      setResult(prev => ({ ...prev, wallet: { ...prev.wallet, balance: r.balance, funded: r.funded, fundingError: null } }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    enterWalletSession(result.user, proof?.providerId);
  }

  const fmtXlm = (n) => `${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM`;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
          Create account with wallet
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-700">
            ← Back to sign in
          </button>
        )}
      </div>

      {/* Step 1: choose + connect a wallet */}
      {step === 'choose' && (
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
      )}

      {/* Step 2: profile form (after proof of ownership) */}
      {step === 'form' && (
        <form onSubmit={submit} className="space-y-3">
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Wallet verified: <span className="font-mono">{shortKey(proof?.publicKey)}</span>
          </div>
          <Field label="Your name">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" autoFocus required />
          </Field>
          <Field label="Email (optional)">
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <Button className="w-full !py-2" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      )}

      {/* Step 3: created — funding status + enter app */}
      {step === 'done' && result && (
        <div className="space-y-3">
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Account created for <span className="font-medium text-slate-900">{result.investor?.name}</span>
            <div className="font-mono mt-0.5">{shortKey(result.wallet?.publicKey)}</div>
          </div>

          {result.wallet?.balance > 0 ? (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
              ✓ Wallet funded on testnet — balance {fmtXlm(result.wallet.balance)}
            </div>
          ) : (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              Wallet isn’t funded yet.
              {result.wallet?.fundingError ? ` (${result.wallet.fundingError})` : ''}
              {' '}You can fund it on testnet now, or fund it manually later from a faucet.
              <div className="mt-2">
                <Button variant="ghost" onClick={fund} disabled={busy}>
                  {busy ? 'Funding…' : 'Fund wallet (testnet)'}
                </Button>
              </div>
            </div>
          )}

          <Button className="w-full !py-2" onClick={finish} disabled={busy}>
            Continue to dashboard →
          </Button>
        </div>
      )}

      <div className="mt-2"><ErrorBanner>{err}</ErrorBanner></div>
    </div>
  );
}
