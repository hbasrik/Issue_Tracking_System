import { useEffect, useId, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { useI18n, type MessageKey } from '../i18n';
import { LogoHomeLink } from './LogoHomeLink';
import { ProfileMenu } from './ProfileMenu';
import { VinSearchBox } from './VinSearchBox';

const NAV: { to: string; labelKey: MessageKey; end?: boolean; perm?: string }[] = [
  { to: '/', labelKey: 'nav.home', end: true },
  { to: '/vehicles', labelKey: 'nav.vehicles', perm: Perm.VehicleView },
  { to: '/issues', labelKey: 'nav.issues', perm: Perm.IssueView },
  { to: '/analysis', labelKey: 'nav.analysis', perm: Perm.AnalysisView },
  { to: '/templates', labelKey: 'nav.templates', perm: Perm.AdminManageMasters },
  { to: '/users', labelKey: 'nav.users', perm: Perm.AdminManageUsers },
  { to: '/roles', labelKey: 'nav.roles', perm: Perm.AdminManageUsers },
];

/**
 * Web dashboard shell — permanent sidebar on desktop (≥1024px);
 * hamburger + drawer on tablet/mobile (<1024px).
 */
export function AppShell() {
  const { has } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const drawerId = useId();

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  return (
    <div className="flex h-screen max-h-dvh overflow-hidden bg-[var(--bg-page)] text-[var(--text-primary)]">
      {/* Desktop sidebar */}
      <aside
        className="hidden h-full w-60 shrink-0 flex-col overflow-hidden lg:flex print:hidden"
        style={{ backgroundColor: 'var(--sidebar-bg)' }}
        aria-label={t('nav.mainMenu')}
      >
        <div className="shrink-0 px-[var(--space-5)] py-[var(--space-5)]">
          <LogoHomeLink />
        </div>
        <NavLinks />
      </aside>

      {/* Mobile/tablet drawer */}
      {navOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-label={t('nav.closeMenu')}
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        id={drawerId}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col overflow-hidden shadow-xl transition-transform duration-200 ease-out lg:hidden print:hidden ${
          navOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        style={{ backgroundColor: 'var(--sidebar-bg)' }}
        aria-hidden={!navOpen}
        aria-label={t('nav.mainMenu')}
      >
        <div className="flex shrink-0 items-center justify-between px-[var(--space-5)] py-[var(--space-4)]">
          <LogoHomeLink />
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-[var(--sidebar-text)] hover:bg-[color-mix(in_srgb,var(--sidebar-text)_12%,transparent)]"
            aria-label={t('nav.closeMenu')}
          >
            <CloseIcon />
          </button>
        </div>
        <NavLinks onNavigate={() => setNavOpen(false)} />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          className="flex w-full shrink-0 flex-wrap items-center gap-2 rounded-b-xl border-b bg-[var(--bg-surface-1)] px-3 py-1.5 sm:px-4 print:hidden"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] lg:hidden"
            style={{ border: '1px solid var(--border)' }}
            aria-expanded={navOpen}
            aria-controls={drawerId}
            aria-label={t('nav.openMenu')}
            onClick={() => setNavOpen(true)}
          >
            <MenuIcon />
          </button>

          <div className="min-w-0 flex-1 basis-[10rem] sm:max-w-xs">
            {has(Perm.VehicleView) ? <VinSearchBox onChrome /> : null}
          </div>

          <div className="ml-auto flex items-center">
            <ProfileMenu />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          <main className="mx-auto w-full max-w-[1440px] p-3 sm:p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { has } = useAuth();
  const { t } = useI18n();
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-[var(--space-3)] pb-[var(--space-4)]">
      {NAV.filter((item) => !item.perm || has(item.perm)).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex min-h-touch items-center rounded-lg px-[var(--space-3)] text-[15px] font-semibold transition-colors ${
              isActive
                ? 'bg-[color-mix(in_srgb,var(--sidebar-text)_20%,transparent)] text-[var(--sidebar-text)]'
                : 'text-[color-mix(in_srgb,var(--sidebar-text)_88%,transparent)] hover:bg-[color-mix(in_srgb,var(--sidebar-text)_12%,transparent)] hover:text-[var(--sidebar-text)]'
            }`
          }
        >
          {t(item.labelKey)}
        </NavLink>
      ))}
    </nav>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
