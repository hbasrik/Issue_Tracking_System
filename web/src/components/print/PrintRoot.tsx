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
  icon,
  variant = 'secondary',
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  icon?: ReactNode;
  variant?: 'secondary' | 'primary';
}) {
  const primary = variant === 'primary';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-touch items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium disabled:opacity-40 ${
        primary
          ? 'bg-[var(--accent)] text-white hover:brightness-110'
          : 'border hover:bg-[var(--bg-surface-2)]'
      }`}
      style={primary ? undefined : { borderColor: 'var(--border)' }}
    >
      {icon}
      {label}
    </button>
  );
}
