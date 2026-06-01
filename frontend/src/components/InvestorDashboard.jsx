import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Section, StatCard, Cards, Badge, TableWrap, Empty, ErrorBanner,
  Select, Money, fmt
} from './ui.jsx';
import DownloadStatementButton from './DownloadStatementButton.jsx';

export default function InvestorDashboard({ refreshKey, forcedInvestorId = null, hideSelector = false }) {
  const [investors, setInvestors] = useState([]);
  const [selectedId, setSelectedId] = useState(forcedInvestorId || '');
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState('');

  // Only admins can fetch the investor list (used to populate the dropdown).
  // Investor users skip this and view their own summary directly.
  useEffect(() => {
    if (hideSelector) {
      setSelectedId(forcedInvestorId || '');
      return;
    }
    api.investors.list()
      .then(list => {
        setInvestors(list);
        setSelectedId(curr => curr || list[0]?.id || '');
      })
      .catch(e => setErr(e.message));
  }, [refreshKey, hideSelector, forcedInvestorId]);

  useEffect(() => {
    if (!selectedId) { setSummary(null); return; }
    api.investors.summary(selectedId)
      .then(setSummary)
      .catch(e => setErr(e.message));
  }, [selectedId, refreshKey]);

  if (err) return <ErrorBanner>{err}</ErrorBanner>;

  return (
    <>
      {!hideSelector && (
        <Section
          title="Investor Dashboard"
          subtitle="Pick an investor to view their portfolio"
          action={
            investors.length > 0 && (
              <Select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                {investors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </Select>
            )
          }
        >
          {investors.length === 0 && (
            <Empty>No investors yet — add one in the Investors tab.</Empty>
          )}
        </Section>
      )}

      {/* Download Statement Button */}
      {summary && selectedId && (
        <div className="mb-5 flex justify-end">
          <DownloadStatementButton investorId={selectedId} investorName={summary.investor?.name} />
        </div>
      )}

      {!summary ? null : (
        <>
          <Cards cols={4}>
            <StatCard label="Total Invested" value={fmt(summary.totals.invested)} sub="lifetime contributions" />
            <StatCard
              label="Total Returns"
              value={fmt(summary.totals.returns)}
              sub={summary.totals.paidReturns ? `${fmt(summary.totals.paidReturns)} paid` : 'none paid yet'}
            />
            <StatCard label="Pending Returns" value={fmt(summary.totals.pendingReturns)} sub="awaiting payout" />
            <StatCard
              label="Current Estimated Value"
              value={fmt(summary.totals.currentEstimatedValue)}
              sub="wallet + invested + returns"
              accent="EST"
            />
          </Cards>

          <Cards cols={3}>
            <StatCard
              label="Wallet Balance"
              value={fmt(summary.wallet?.balance)}
              sub={
                summary.wallet?.custodial === false && summary.wallet?.publicKey
                  ? `Connected ${summary.wallet.publicKey.slice(0, 4)}…${summary.wallet.publicKey.slice(-4)} · live on testnet`
                  : 'XLM on testnet'
              }
              accent={summary.wallet?.custodial === false ? 'WALLET' : undefined}
            />
            <StatCard label="Projects Invested In" value={summary.totals.projectsCount} />
            <StatCard label="Investment Tx Count" value={summary.totals.transactionsCount} />
          </Cards>

          <Section title="Projects" subtitle="Projects this investor has earned distributions from">
            {summary.projects.length === 0 ? (
              <Empty>No project distributions yet for this investor.</Empty>
            ) : (
              <TableWrap>
                <table>
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Crop</th>
                      <th>Status</th>
                      <th className="!text-right">Estimated Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.projects.map(p => (
                      <tr key={p.id}>
                        <td className="font-medium text-slate-900">{p.name}</td>
                        <td>{p.cropType || <span className="text-slate-400">—</span>}</td>
                        <td><Badge kind={p.status}>{p.status}</Badge></td>
                        <td className="text-right"><Money value={p.estimatedReturn} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Section>

          <Section title="Distributions" subtitle="Profit splits issued to this investor">
            {summary.distributions.length === 0 ? (
              <Empty>No distributions issued yet.</Empty>
            ) : (
              <TableWrap>
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Project</th>
                      <th className="!text-right">Share %</th>
                      <th className="!text-right">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.distributions.map(d => (
                      <tr key={d.id}>
                        <td className="text-slate-500">{new Date(d.timestamp).toLocaleString()}</td>
                        <td>{d.projectName}</td>
                        <td className="text-right tabular-nums">{d.sharePercent}%</td>
                        <td className="text-right"><Money value={d.amount} /></td>
                        <td><Badge kind={d.status}>{d.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Section>

          <Section title="Transaction History" subtitle="All investments made by this investor">
            {summary.transactions.length === 0 ? (
              <Empty>No investments yet.</Empty>
            ) : (
              <TableWrap>
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Stage</th>
                      <th>To</th>
                      <th className="!text-right">Amount</th>
                      <th>Tx Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.transactions.map(t => (
                      <tr key={t.id}>
                        <td className="text-slate-500">{new Date(t.timestamp).toLocaleString()}</td>
                        <td><Badge kind={t.stage}>{t.stage}</Badge></td>
                        <td>{t.receiverLabel}</td>
                        <td className="text-right"><Money value={t.amount} /></td>
                        <td className="mono">{t.txHash}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Section>
        </>
      )}
    </>
  );
}
