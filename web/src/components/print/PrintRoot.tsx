import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Logo } from '../Logo';

export function PrintRoot({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="print-root" data-print-id={id}>
      {children}
    </div>,
    document.body,
  );
}

export function PrintHeader({
  title,
  meta,
}: {
  title: string;
  meta: { label: string; value: string }[];
}) {
  return (
    <header className="print-header">
      <div className="print-header-brand">
        <Logo height={48} className="print-logo" />
        <h1>{title}</h1>
      </div>
      <dl className="print-meta">
        {meta.map((row) => (
          <div key={row.label} className="contents">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

export function PrintButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-touch rounded-lg border px-3 py-1.5 text-[13px] hover:bg-[var(--bg-surface-2)] disabled:opacity-40"
      style={{ borderColor: 'var(--border)' }}
    >
      {label}
    </button>
  );
}
