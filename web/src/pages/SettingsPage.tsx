import { useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { useI18n, type Locale } from '../i18n';

/** Settings — dark/light toggle + own password. */
export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode, toggle } = useTheme();
  const [passwordSaved, setPasswordSaved] = useState(false);

  return (
    <section>
      <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        {t('settings.subtitle')}
      </p>

      <div
        className="mt-6 max-w-lg space-y-6 rounded-xl border bg-[var(--bg-surface-1)] p-5"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <h2 className="text-[15px] font-medium">{t('settings.theme')}</h2>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            {t('settings.themeHint')}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setMode('dark')}
              className={`min-h-touch rounded-lg px-4 text-[15px] ${
                mode === 'dark'
                  ? 'bg-[var(--accent)] text-white'
                  : 'border text-[var(--text-primary)]'
              }`}
              style={mode !== 'dark' ? { borderColor: 'var(--border)' } : undefined}
            >
              {t('settings.themeDark')}
            </button>
            <button
              type="button"
              onClick={() => setMode('light')}
              className={`min-h-touch rounded-lg px-4 text-[15px] ${
                mode === 'light'
                  ? 'bg-[var(--accent)] text-white'
                  : 'border text-[var(--text-primary)]'
              }`}
              style={mode !== 'light' ? { borderColor: 'var(--border)' } : undefined}
            >
              {t('settings.themeLight')}
            </button>
            <button
              type="button"
              onClick={toggle}
              className="min-h-touch rounded-lg border px-4 text-[15px]"
              style={{ borderColor: 'var(--border)' }}
            >
              {t('settings.themeToggle')}
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-[15px] font-medium">{t('settings.language')}</h2>
          <select
            className="mt-2 rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            <option value="tr">{t('settings.langTr')}</option>
            <option value="en">{t('settings.langEn')}</option>
          </select>
        </div>

        <div>
          <h2 className="text-[15px] font-medium">{t('settings.notifications')}</h2>
          <label className="mt-2 flex items-center gap-2 text-[15px]">
            <input type="checkbox" defaultChecked />
            {t('settings.criticalAlerts')}
          </label>
        </div>
      </div>

      <div
        className="mt-6 max-w-lg space-y-4 rounded-xl border bg-[var(--bg-surface-1)] p-5"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <h2 className="text-[15px] font-medium">{t('settings.password')}</h2>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            {t('settings.passwordHint')}
          </p>
        </div>
        {passwordSaved && (
          <p className="text-[13px]" style={{ color: 'var(--status-ok)' }}>
            {t('settings.passwordSaved')}
          </p>
        )}
        <ChangePasswordForm
          onSuccess={() => setPasswordSaved(true)}
          submitLabel={t('settings.passwordSubmit')}
        />
      </div>
    </section>
  );
}
