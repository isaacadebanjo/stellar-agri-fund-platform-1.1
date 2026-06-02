import React, { useState, useEffect } from 'react';
import { Button, Input, Field, ErrorBanner } from './ui.jsx';

// Reusable amount-entry dialog that replaces blocking window.prompt() calls for
// money operations. Validates a positive numeric amount client-side and shows
// API errors inline (non-blocking) instead of window.alert(). `onConfirm`
// receives the parsed Number and may be async; the dialog stays open and shows
// the error if it rejects, and closes on success.
export default function AmountModal({
  open,
  title,
  subtitle,
  label = 'Amount (XLM)',
  confirmLabel = 'Confirm',
  onConfirm,
  onClose
}) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset state each time the dialog opens.
  useEffect(() => {
    if (open) { setValue(''); setErr(''); setBusy(false); }
  }, [open]);

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      setErr('Enter an amount greater than 0.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await onConfirm(n);
      onClose();
    } catch (e) {
      setErr(e.message || 'Something went wrong.');
    }
    setBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={onClose}
    >
      <div className="w-full max-w-sm card p-5" onMouseDown={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label={label}>
            <Input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <ErrorBanner>{err}</ErrorBanner>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button disabled={busy}>{busy ? 'Working…' : confirmLabel}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
