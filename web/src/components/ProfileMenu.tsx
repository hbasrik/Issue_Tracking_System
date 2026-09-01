import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';
import { roleDisplayName, userInitials } from '../lib/roleLabels';

/** Header avatar + menu: name, readable role, settings, logout. */
export function ProfileMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function menuItems(): HTMLElement[] {
      return Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );
    }
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      const items = menuItems();
      if (items.length === 0) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(i + 1) % items.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[(i - 1 + items.length) % items.length].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1].focus();
      }
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const initials = userInitials(user.FullName);
  const roleName = roleDisplayName(user.Role, t);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('nav.profileMenu')}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface-1)] text-[13px] font-semibold text-[var(--text-primary)] outline-none hover:bg-[var(--bg-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {initials}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border bg-[var(--bg-surface-1)] py-1 shadow-lg"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="border-b px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
            <p className="truncate text-[14px] font-semibold text-[var(--text-primary)]">
              {user.FullName}
            </p>
            <p className="mt-0.5 truncate text-[12px] text-[var(--text-secondary)]">
              {roleName}
            </p>
          </div>
          <Link
            role="menuitem"
            to="/settings"
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-[14px] text-[var(--text-primary)] outline-none hover:bg-[var(--bg-surface-2)] focus-visible:bg-[var(--bg-surface-2)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
          >
            {t('nav.settings')}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="block w-full px-3 py-2.5 text-left text-[14px] text-[var(--text-primary)] outline-none hover:bg-[var(--bg-surface-2)] focus-visible:bg-[var(--bg-surface-2)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
          >
            {t('common.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
