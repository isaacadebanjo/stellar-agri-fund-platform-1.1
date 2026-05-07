import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Section, Button, Input, TableWrap, Empty, ErrorBanner, Money, fmt
} from './ui.jsx';

export default function Investors({ refreshKey, onChange }) {
  const [investors, setInvestors] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.investors.list().then(setInvestors).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [refreshKey]);

  async function addInvestor(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.investors.create({ name: name.trim(), email: email.trim() });
      setName(''); setEmail(''); setErr('');
      await load(); onChange?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function fund(id) {
    const amount = prompt('Top up wallet by how much XLM (sent from treasury via testnet)?');
    if (!amount) return;
    try {
      await api.investors.fund(id, Number(amount));
      await load(); onChange?.();
    } catch (e) { alert(e.message); }
  }

  async function invest(id, available) {
    const amount = prompt(`Invest into treasury — available ${fmt(available)}:`);
    if (!amount) return;
    try {
      await api.transactions.invest(id, Number(amount));
      await load(); onChange?.();
    } catch (e) { alert(e.message); }
  }

  return (
    <>
      <Section title="Add Investor" subtitle="Generates a new mock Stellar wallet for the investor">
        <form onSubmit={addInvestor} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required className="flex-1 min-w-[180px]" />
            <Input placeholder="Email (optional)" value={email} onChange={e => setEmail(e.target.value)} className="flex-1 min-w-[180px]" />
            <Button disabled={busy}>Create wallet + investor</Button>
          </div>
          <ErrorBanner>{err}</ErrorBanner>
        </form>
      </Section>

      <Section title="Investors" subtitle={`${investors.length} total`}>
        {investors.length === 0 ? (
          <Empty>No investors yet.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Wallet (Stellar pubkey)</th>
                  <th className="!text-right">Balance</th>
                  <th className="!text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {investors.map(inv => (
                  <tr key={inv.id}>
                    <td className="font-medium text-slate-900">{inv.name}</td>
                    <td className="text-slate-500">{inv.email || '—'}</td>
                    <td className="mono truncate max-w-[280px]">{inv.wallet?.publicKey}</td>
                    <td className="text-right"><Money value={inv.wallet?.balance} /></td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button variant="ghost" onClick={() => fund(inv.id)}>Fund</Button>
                        <Button onClick={() => invest(inv.id, inv.wallet?.balance ?? 0)}>Invest →</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>
    </>
  );
}
