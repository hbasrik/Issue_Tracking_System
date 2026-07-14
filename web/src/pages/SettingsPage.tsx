import { useTheme } from '../theme/ThemeProvider';

/** Settings — dark/light toggle + preferences shell (§2.1). */
export default function SettingsPage() {
  const { mode, setMode, toggle } = useTheme();

  return (
    <section>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Appearance and preferences
      </p>

      <div
        className="mt-6 max-w-lg space-y-6 rounded-xl border bg-[var(--bg-surface-1)] p-5"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <h2 className="text-[15px] font-medium">Theme</h2>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            Dark mode is the default (design guide §1.1). Preference is kept in
            memory for this session.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setMode('dark')}
              className={`rounded-lg px-4 py-2 text-[15px] ${
                mode === 'dark'
                  ? 'bg-[var(--accent)] text-white'
                  : 'border text-[var(--text-primary)]'
              }`}
              style={mode !== 'dark' ? { borderColor: 'var(--border)' } : undefined}
            >
              Dark
            </button>
            <button
              type="button"
              onClick={() => setMode('light')}
              className={`rounded-lg px-4 py-2 text-[15px] ${
                mode === 'light'
                  ? 'bg-[var(--accent)] text-white'
                  : 'border text-[var(--text-primary)]'
              }`}
              style={mode !== 'light' ? { borderColor: 'var(--border)' } : undefined}
            >
              Light
            </button>
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg border px-4 py-2 text-[15px]"
              style={{ borderColor: 'var(--border)' }}
            >
              Toggle
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-[15px] font-medium">Language</h2>
          <select
            className="mt-2 rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
            defaultValue="en"
          >
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </select>
        </div>

        <div>
          <h2 className="text-[15px] font-medium">Notifications</h2>
          <label className="mt-2 flex items-center gap-2 text-[15px]">
            <input type="checkbox" defaultChecked />
            Critical issue alerts
          </label>
        </div>
      </div>
    </section>
  );
}
