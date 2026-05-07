import React, { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Button, Input, Field, ErrorBanner } from './ui.jsx';

const DEMOS = [
  { label: 'Admin',    email: 'admin@agri.io',    password: 'admin123'    },
  { label: 'Investor', email: 'investor@agri.io', password: 'investor123' }
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await login(email.trim(), password);
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  }

  function fillDemo(d) {
    setEmail(d.email);
    setPassword(d.password);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 flex items-center justify-center text-white text-2xl shadow-pop mb-3">
            🌱
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Agri Funds Tracker</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your account</p>
        </div>

        <div className="card p-6">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </Field>
            <ErrorBanner>{err}</ErrorBanner>
            <Button className="w-full !py-2" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-200">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2">
              Demo accounts
            </div>
            <div className="space-y-1.5">
              {DEMOS.map(d => (
                <button
                  type="button"
                  key={d.email}
                  onClick={() => fillDemo(d)}
                  className="w-full flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900">{d.label}</div>
                    <div className="text-xs text-slate-500">{d.email}</div>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">{d.password}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Prototype build · v0.4
        </p>
      </div>
    </div>
  );
}
