import { NavLink, Outlet } from 'react-router-dom';
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
 * Web dashboard shell — §4.1: 240px sidebar + topbar + content max 1440px.
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const { mode, toggle } = useTheme();

  return (
    <div className="flex min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)]">
      <aside
        className="flex w-60 shrink-0 flex-col border-r bg-[var(--bg-surface-1)]"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="px-5 py-5 text-xl font-semibold tracking-tight">
          Karea
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2.5 text-[15px] transition-colors ${
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
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex items-center gap-4 border-b bg-[var(--bg-surface-1)] px-6 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="max-w-xs flex-1">
            <VinSearchBox />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg border px-3 py-1.5 text-[13px] text-[var(--text-secondary)]"
              style={{ borderColor: 'var(--border)' }}
              aria-label="Toggle dark/light mode"
            >
              {mode === 'dark' ? 'Light' : 'Dark'}
            </button>
            {user && (
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[var(--text-secondary)]">
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
                  className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
