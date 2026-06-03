import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Section, Button, Badge, Empty, ErrorBanner } from './ui.jsx';

export default function AssistantPanel({ refreshKey }) {
  const [status, setStatus] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.assistant.status().then(setStatus).catch(() => setStatus({ llmEnabled: false, prompts: [] }));
  }, [refreshKey]);

  async function ask(q) {
    const text = (q ?? prompt).trim();
    if (!text) return;
    setLoading(true); setErr(''); setAnswer(null);
    try {
      const res = await api.assistant.query(text);
      setAnswer(res);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }

  return (
    <>
      <Section
        title="Investment Committee Assistant"
        subtitle="Ask about performance, risk, treasury and returns — answered from live platform analytics."
        action={status && (
          <Badge kind={status.llmEnabled ? 'paid' : 'neutral'}>
            {status.llmEnabled ? 'AI-enhanced' : 'Analytics mode'}
          </Badge>
        )}
      >
        <div className="flex flex-wrap gap-2 mb-3">
          {(status?.prompts || []).map(p => (
            <button key={p} onClick={() => { setPrompt(p); ask(p); }}
              className="text-xs font-medium text-slate-600 bg-white ring-1 ring-slate-200 rounded-full px-3 py-1.5 hover:bg-slate-50 hover:ring-slate-300">
              {p}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Ask a question, e.g. “What are the biggest risks?”"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ask(); }}
          />
          <Button onClick={() => ask()} disabled={loading}>{loading ? 'Thinking…' : 'Ask'}</Button>
        </div>
        <ErrorBanner>{err}</ErrorBanner>
        {!status?.llmEnabled && (
          <p className="mt-2 text-[11px] text-slate-400">
            Running in deterministic analytics mode (no external API). Set ANTHROPIC_API_KEY on the server to enable AI-enhanced natural-language briefings.
          </p>
        )}
      </Section>

      {loading && <Empty>Analyzing platform data…</Empty>}

      {answer && (
        <Section
          title={answer.title}
          action={<Badge kind={answer.enhanced ? 'paid' : 'neutral'}>{answer.enhanced ? 'AI-enhanced' : 'deterministic'}</Badge>}
        >
          {answer.narrative && (
            <div className="mb-4 rounded-lg bg-brand-50/50 ring-1 ring-brand-100 p-4 text-sm text-slate-700 whitespace-pre-wrap">
              {answer.narrative}
            </div>
          )}
          <p className="text-sm text-slate-700">{answer.text}</p>
          <div className="mt-4 space-y-4">
            {(answer.sections || []).filter(s => s.lines?.length).map((s, i) => (
              <div key={i}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">{s.heading}</h4>
                <ul className="space-y-1">
                  {s.lines.map((l, j) => (
                    <li key={j} className="text-sm text-slate-700 flex gap-2">
                      <span className="text-brand-500">•</span><span>{l}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
