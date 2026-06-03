import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Section, StatCard, Cards, Button, Badge, TableWrap, Empty, ErrorBanner, fmt } from './ui.jsx';

const statusKind = (s) => (s === 'approved' ? 'paid' : s === 'rejected' ? 'cancelled' : 'pending');

export default function Governance({ refreshKey, onChange }) {
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [dash, setDash] = useState(null);
  const [err, setErr] = useState('');

  const load = () => Promise.all([
    api.governance.pending(),
    api.governance.history({ page: 1, limit: 50 }),
    api.governance.dashboard()
  ])
    .then(([p, h, d]) => { setPending(p); setHistory(h.data || []); setDash(d); })
    .catch(e => setErr(e.message));
  useEffect(() => { load(); }, [refreshKey]);

  async function decide(id, action) {
    try {
      if (action === 'approve') await api.governance.approve(id);
      else await api.governance.reject(id);
      setErr('');
      await load(); onChange?.();
    } catch (e) { setErr(e.message); }
  }

  return (
    <>
      {dash && (
        <Cards cols={5}>
          <StatCard label="Pending" value={dash.pending} accent={dash.pending ? 'ACTION' : undefined} sub={dash.oldestPendingHours ? `oldest ${dash.oldestPendingHours}h` : 'none waiting'} />
          <StatCard label="Approved" value={dash.approved} />
          <StatCard label="Rejected" value={dash.rejected} />
          <StatCard label="Approval Rate" value={`${dash.approvalRate}%`} sub={`${dash.total} total requests`} />
          <StatCard label="Avg Decision" value={`${dash.avgDecisionHours}h`} sub="submit → decision" />
        </Cards>
      )}

      <Section
        title="Pending Approvals"
        subtitle="Sensitive actions awaiting governance sign-off. Approve, then run the action again to execute."
      >
        <ErrorBanner>{err}</ErrorBanner>
        {pending.length === 0 ? (
          <Empty>No pending approvals.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Request ID</th><th>Requested</th><th>Action</th><th>Summary</th>
                  <th className="!text-right">Amount</th><th className="!text-right"></th>
                </tr>
              </thead>
              <tbody>
                {pending.map(a => (
                  <tr key={a.id}>
                    <td className="font-mono text-xs text-slate-400">{a.id}</td>
                    <td className="text-slate-500 whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</td>
                    <td><Badge kind="pending">{a.actionType}</Badge></td>
                    <td>{a.summary}</td>
                    <td className="text-right tabular-nums">{a.amount ? fmt(a.amount) : '—'}</td>
                    <td className="text-right">
                      <div className="inline-flex gap-2">
                        <Button variant="ghost" onClick={() => decide(a.id, 'reject')}>Reject</Button>
                        <Button onClick={() => decide(a.id, 'approve')}>Approve</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>

      <Section title="Approval History" subtitle={`${history.length} recent decisions`}>
        {history.length === 0 ? (
          <Empty>No approval history yet.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>When</th><th>Action</th><th>Summary</th>
                  <th className="!text-right">Amount</th><th>Status</th><th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {history.map(a => (
                  <tr key={a.id}>
                    <td className="text-slate-500 whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</td>
                    <td>{a.actionType}</td>
                    <td>{a.summary}</td>
                    <td className="text-right tabular-nums">{a.amount ? fmt(a.amount) : '—'}</td>
                    <td><Badge kind={statusKind(a.status)}>{a.status}</Badge></td>
                    <td className="text-xs text-slate-500">
                      {a.decisionAt ? new Date(a.decisionAt).toLocaleString() : '—'}
                      {a.consumedAt ? ' · executed' : ''}
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
