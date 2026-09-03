import { useEffect, useId, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Car,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  History,
  Home,
  LayoutGrid,
  Shield,
  Users,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { useI18n, type MessageKey } from '../i18n';
import { LogoHomeLink } from './LogoHomeLink';
import { ProfileMenu } from './ProfileMenu';
import { VinSearchBox } from './VinSearchBox';

const NAV_COLLAPSE_KEY = 'karea-nav-collapsed';

const NAV: {
  to: string;
  labelKey: MessageKey;
  end?: boolean;
  perm?: string;
  icon: typeof Home;
}[] = [
  { to: '/', labelKey: 'nav.home', end: true, icon: Home },
  { to: '/vehicles', labelKey: 'nav.vehicles', perm: Perm.VehicleView, icon: Car },
  { to: '/issues', labelKey: 'nav.issues', perm: Perm.IssueView, icon: ClipboardList },
  { to: '/analysis', labelKey: 'nav.analysis', perm: Perm.AnalysisView, icon: BarChart3 },
  { to: '/activity', labelKey: 'nav.activity', perm: Perm.AnalysisView, icon: History },
  { to: '/templates', labelKey: 'nav.templates', perm: Perm.AdminManageMasters, icon: LayoutGrid },
  { to: '/users', labelKey: 'nav.users', perm: Perm.AdminManageUsers, icon: Users },
  { to: '/roles', labelKey: 'nav.roles', perm: Perm.AdminManageUsers, icon: Shield },
];

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(NAV_COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Web dashboard shell — permanent sidebar on desktop (≥1024px);
 * hamburger + drawer on tablet/mobile (<1024px).
 */
export function AppShell() {
  const { has } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
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

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(NAV_COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* quota / private mode */
      }
      return next;
    });
  }

  return (
    <div className="flex h-screen max-h-dvh overflow-hidden bg-[var(--bg-page)] text-[var(--text-primary)]">
      <aside
        className={`hidden h-full shrink-0 flex-col overflow-hidden lg:flex print:hidden ${
          collapsed ? 'w-[4.5rem]' : 'w-60'
        }`}
        style={{ backgroundColor: 'var(--sidebar-bg)' }}
        aria-label={t('nav.mainMenu')}
      >
        <div className={`shrink-0 py-[var(--space-5)] ${collapsed ? 'px-2' : 'px-[var(--space-5)]'}`}>
          {collapsed ? (
            <div className="flex justify-center">
              <LogoHomeLink compact />
            </div>
          ) : (
            <LogoHomeLink />
          )}
        </div>
        <NavLinks collapsed={collapsed} />
        <div className="mt-auto shrink-0 p-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            className="flex min-h-touch w-full items-center gap-2 rounded-lg px-3 text-[14px] font-semibold text-[color-mix(in_srgb,var(--sidebar-text)_88%,transparent)] hover:bg-[color-mix(in_srgb,var(--sidebar-text)_12%,transparent)] hover:text-[var(--sidebar-text)]"
          >
            {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            {!collapsed && <span>{t('nav.collapse')}</span>}
          </button>
        </div>
      </aside>

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

function NavLinks({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const { has } = useAuth();
  const { t } = useI18n();
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-2 pb-[var(--space-4)]">
      {NAV.filter((item) => !item.perm || has(item.perm)).map((item) => {
        const Icon = item.icon;
        const label = t(item.labelKey);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex min-h-touch items-center gap-3 rounded-lg text-[15px] font-semibold transition-colors ${
                collapsed ? 'justify-center px-0' : 'px-[var(--space-3)]'
              } ${
                isActive
                  ? 'bg-[color-mix(in_srgb,var(--sidebar-text)_20%,transparent)] text-[var(--sidebar-text)]'
                  : 'text-[color-mix(in_srgb,var(--sidebar-text)_88%,transparent)] hover:bg-[color-mix(in_srgb,var(--sidebar-text)_12%,transparent)] hover:text-[var(--sidebar-text)]'
              }`
            }
          >
            <Icon size={18} strokeWidth={2} aria-hidden className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
            {collapsed && <span className="sr-only">{label}</span>}
          </NavLink>
        );
      })}
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
