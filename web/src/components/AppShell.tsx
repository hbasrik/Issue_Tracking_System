import { useEffect, useId, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../theme/ThemeProvider';
import { VinSearchBox } from './VinSearchBox';

const NAV: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/vehicles', label: 'Vehicles' },
  { to: '/issues', label: 'Issues' },
  { to: '/analysis', label: 'Analysis' },
  { to: '/templates', label: 'Templates' },
  { to: '/users', label: 'Users' },
  { to: '/settings', label: 'Settings' },
];

/**
 * Web dashboard shell — permanent sidebar on desktop (≥1024px);
 * hamburger + drawer on tablet/mobile (<1024px).
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const { mode, toggle } = useTheme();
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
        className="hidden w-60 shrink-0 flex-col border-r bg-[var(--bg-surface-1)] lg:flex"
        style={{ borderColor: 'var(--border)' }}
        aria-label="Main navigation"
      >
        <div className="px-5 py-5 text-xl font-semibold tracking-tight">
          Karea
        </div>
        <NavLinks />
      </aside>

      {/* Mobile/tablet drawer */}
      {navOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        id={drawerId}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col border-r bg-[var(--bg-surface-1)] shadow-xl transition-transform duration-200 ease-out lg:hidden ${
          navOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        style={{ borderColor: 'var(--border)' }}
        aria-hidden={!navOpen}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-xl font-semibold tracking-tight">Karea</span>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
        </div>
        <NavLinks onNavigate={() => setNavOpen(false)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex flex-wrap items-center gap-3 border-b bg-[var(--bg-surface-1)] px-3 py-3 sm:gap-4 sm:px-6"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            className="flex min-h-touch min-w-touch items-center justify-center rounded-lg border text-[var(--text-secondary)] lg:hidden"
            style={{ borderColor: 'var(--border)' }}
            aria-expanded={navOpen}
            aria-controls={drawerId}
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <MenuIcon />
          </button>

          <div className="min-w-0 flex-1 basis-[10rem] sm:max-w-xs">
            <VinSearchBox />
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <button
              type="button"
              onClick={toggle}
              className="min-h-touch rounded-lg border px-3 text-[13px] text-[var(--text-secondary)]"
              style={{ borderColor: 'var(--border)' }}
              aria-label="Toggle dark/light mode"
            >
              {mode === 'dark' ? 'Light' : 'Dark'}
            </button>
            {user && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="hidden text-[13px] text-[var(--text-secondary)] sm:inline">
                  {user.FullName}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[12px] font-medium"
                  style={{
                    color: 'var(--accent)',
                    backgroundColor:
                      'color-mix(in srgb, var(--accent) 15%, transparent)',
                  }}
                >
                  Manager/Admin
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="min-h-touch text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Log out
                </button>
              </div>
            )}
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
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3 pb-4">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex min-h-touch items-center rounded-lg px-3 text-[15px] transition-colors ${
              isActive
                ? 'bg-[var(--bg-surface-2)] font-medium text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
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
