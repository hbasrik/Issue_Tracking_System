import type { ReactNode } from 'react';

/** Labeled value row used inside stacked mobile cards. */
export function DataCardField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-[15px]">
      <span className="shrink-0 text-[13px] text-[var(--text-secondary)]">
        {label}
      </span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

/** Card shell for a single table-row equivalent on &lt;640px. */
export function DataCard({
  children,
  onClick,
  selected,
}: {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
}) {
  const interactive = Boolean(onClick);
  const className = `rounded-xl border bg-[var(--bg-surface-1)] p-4 space-y-2.5 ${
    interactive ? 'cursor-pointer active:bg-[var(--bg-surface-2)]' : ''
  } ${selected ? 'ring-1 ring-[var(--accent)]' : ''}`;

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} w-full text-left`}
        style={{ borderColor: 'var(--border)' }}
      >
        {children}
      </button>
    );
  }

  return (
    <div className={className} style={{ borderColor: 'var(--border)' }}>
      {children}
    </div>
  );
}

/** Stacked list wrapper — visible only below the tablet breakpoint. */
export function MobileCardStack({
  children,
  empty,
}: {
  children: ReactNode;
  empty?: ReactNode;
}) {
  return (
    <div className="space-y-3 sm:hidden">
      {children}
      {empty}
    </div>
  );
}

/** Table wrapper — visible from tablet (640px) upward. */
export function DesktopTableShell({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`hidden overflow-hidden rounded-xl border bg-[var(--bg-surface-1)] sm:block ${className}`}
      style={{ borderColor: 'var(--border)' }}
    >
      {children}
    </div>
  );
}
