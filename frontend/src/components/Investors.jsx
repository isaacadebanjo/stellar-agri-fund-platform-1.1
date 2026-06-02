import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Section, Button, Input, TableWrap, Empty, ErrorBanner, Money, fmt
} from './ui.jsx';
import AmountModal from './AmountModal.jsx';
import DownloadStatementButton from './DownloadStatementButton.jsx';

export default function Investors({ refreshKey, onChange }) {
  const [investors, setInvestors] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // { kind: 'fund' | 'invest', investor } — drives the amount-entry modal.
  const [modal, setModal] = useState(null);

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

  async function confirmModal(amount) {
    if (modal.kind === 'fund') {
      await api.investors.fund(modal.investor.id, amount);
    } else {
      await api.transactions.invest(modal.investor.id, amount);
    }
    await load(); onChange?.();
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
                        <DownloadStatementButton investorId={inv.id} investorName={inv.name} />
                        <Button variant="ghost" onClick={() => setModal({ kind: 'fund', investor: inv })}>Fund</Button>
                        <Button onClick={() => setModal({ kind: 'invest', investor: inv })}>Invest →</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>

      <AmountModal
        open={!!modal}
        title={modal?.kind === 'fund' ? 'Fund investor wallet' : 'Invest into treasury'}
        subtitle={
          modal?.kind === 'fund'
            ? `Top up ${modal?.investor?.name}'s wallet from the treasury (testnet).`
            : `Invest from ${modal?.investor?.name}'s wallet — available ${fmt(modal?.investor?.wallet?.balance ?? 0)}.`
        }
        confirmLabel={modal?.kind === 'fund' ? 'Fund wallet' : 'Invest'}
        onConfirm={confirmModal}
        onClose={() => setModal(null)}
      />
    </>
  );
}
