import { useEffect, useId, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { LogoHomeLink } from './LogoHomeLink';
import { ProfileMenu } from './ProfileMenu';
import { VinSearchBox } from './VinSearchBox';

const NAV: { to: string; label: string; end?: boolean; perm?: string }[] = [
  { to: '/', label: 'Ana sayfa', end: true },
  { to: '/vehicles', label: 'Araçlar', perm: Perm.VehicleView },
  { to: '/issues', label: 'Issues', perm: Perm.IssueView },
  { to: '/analysis', label: 'Analiz', perm: Perm.AnalysisView },
  { to: '/templates', label: 'Şablonlar', perm: Perm.AdminManageMasters },
  { to: '/users', label: 'Kullanıcılar', perm: Perm.AdminManageUsers },
  { to: '/roles', label: 'Roller', perm: Perm.AdminManageUsers },
];

/**
 * Web dashboard shell — permanent sidebar on desktop (≥1024px);
 * hamburger + drawer on tablet/mobile (<1024px).
 */
export function AppShell() {
  const { has } = useAuth();
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
    <div className="flex min-h-screen overflow-x-hidden bg-[var(--bg-page)] text-[var(--text-primary)]">
      {/* Desktop sidebar */}
      <aside
        className="hidden w-60 shrink-0 flex-col lg:flex"
        style={{ backgroundColor: 'var(--sidebar-bg)' }}
        aria-label="Ana menü"
      >
        <div className="px-[var(--space-5)] py-[var(--space-5)]">
          <LogoHomeLink />
        </div>
        <NavLinks />
      </aside>

      {/* Mobile/tablet drawer */}
      {navOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-label="Menüyü kapat"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        id={drawerId}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col shadow-xl transition-transform duration-200 ease-out lg:hidden ${
          navOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        style={{ backgroundColor: 'var(--sidebar-bg)' }}
        aria-hidden={!navOpen}
        aria-label="Ana menü"
      >
        <div className="flex items-center justify-between px-[var(--space-5)] py-[var(--space-4)]">
          <LogoHomeLink />
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-[var(--sidebar-text)] hover:bg-[color-mix(in_srgb,var(--sidebar-text)_12%,transparent)]"
            aria-label="Menüyü kapat"
          >
            <CloseIcon />
          </button>
        </div>
        <NavLinks onNavigate={() => setNavOpen(false)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex flex-wrap items-center gap-3 px-3 py-3 sm:gap-4 sm:px-6"
          style={{ backgroundColor: 'var(--sidebar-bg)' }}
        >
          <button
            type="button"
            className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-[var(--sidebar-text)] hover:bg-[color-mix(in_srgb,var(--sidebar-text)_12%,transparent)] lg:hidden"
            style={{
              border: '1px solid color-mix(in srgb, var(--sidebar-text) 35%, transparent)',
            }}
            aria-expanded={navOpen}
            aria-controls={drawerId}
            aria-label="Menüyü aç"
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

        <main className="mx-auto w-full max-w-[1440px] flex-1 overflow-x-hidden p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { has } = useAuth();
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-[var(--space-3)] pb-[var(--space-4)]">
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
          {item.label}
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
