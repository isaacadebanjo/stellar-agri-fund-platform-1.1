import React from 'react';

// All amounts in this app are Stellar lumens (XLM), not fiat — format with an
// "XLM" suffix rather than a "$" prefix. Used app-wide (StatCards, Money, tables).
export const fmt = n =>
  `${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XLM`;

const cx = (...arr) => arr.filter(Boolean).join(' ');

export function Section({ title, subtitle, action, children, className }) {
  return (
    <section className={cx('section', className)}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="section-title">{title}</h2>}
            {subtitle && <p className="section-sub">{subtitle}</p>}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, sub, accent }) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className="stat-label">{label}</div>
        {accent && (
          <span className="text-[11px] font-medium text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded-md ring-1 ring-brand-100">
            {accent}
          </span>
        )}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Cards({ children, cols = 4, className }) {
  const colClass = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
    6: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'
  }[cols] || 'sm:grid-cols-2 lg:grid-cols-4';
  return (
    <div className={cx('grid grid-cols-1 gap-4 mb-5', colClass, className)}>
      {children}
    </div>
  );
}

export function Badge({ kind = 'neutral', children }) {
  return (
    <span className={cx('badge', `badge-${kind}`)}>
      <span className={cx('badge-dot', `bg-current opacity-70`)} />
      {children}
    </span>
  );
}

export function Button({ variant = 'primary', className, children, ...props }) {
  const cls = variant === 'ghost' ? 'btn-ghost' : variant === 'danger' ? 'btn-danger' : 'btn-primary';
  return (
    <button className={cx(cls, className)} {...props}>
      {children}
    </button>
  );
}

export function Input(props) {
  return <input {...props} className={cx('input', props.className)} />;
}

export function Select({ children, ...props }) {
  return (
    <select {...props} className={cx('select', props.className)}>
      {children}
    </select>
  );
}

export function Field({ label, children, className }) {
  return (
    <label className={cx('flex flex-col gap-1.5 text-xs font-medium text-slate-600', className)}>
      {label && <span>{label}</span>}
      {children}
    </label>
  );
}

export function TableWrap({ children }) {
  return <div className="table-wrap">{children}</div>;
}

export function Empty({ children }) {
  return (
    <div className="text-center py-10 text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg bg-slate-50/40">
      {children}
    </div>
  );
}

export function ErrorBanner({ children }) {
  if (!children) return null;
  return (
    <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
      {children}
    </div>
  );
}

export function Toolbar({ children, className }) {
  return <div className={cx('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

export function Money({ value, signed = false }) {
  const v = value ?? 0;
  const cls =
    signed && v > 0 ? 'text-emerald-700' :
    signed && v < 0 ? 'text-rose-700' : 'text-slate-900';
  return <span className={cx('tabular-nums font-medium', cls)}>{fmt(v)}</span>;
}
