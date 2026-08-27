import { useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { ChangePasswordForm } from '../components/ChangePasswordForm';

/** Settings — dark/light toggle + own password. */
export default function SettingsPage() {
  const { mode, setMode, toggle } = useTheme();
  const [passwordSaved, setPasswordSaved] = useState(false);

  return (
    <section>
      <h1 className="text-2xl font-semibold">Ayarlar</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Görünüm ve tercihler
      </p>

      <div
        className="mt-6 max-w-lg space-y-6 rounded-xl border bg-[var(--bg-surface-1)] p-5"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <h2 className="text-[15px] font-medium">Tema</h2>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            Varsayılan açık temadır. Koyu veya açık seçimi sonraki ziyaretler
            için kaydedilir.
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
              Koyu
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
              Açık
            </button>
            <button
              type="button"
              onClick={toggle}
              className="min-h-touch rounded-lg border px-4 text-[15px]"
              style={{ borderColor: 'var(--border)' }}
            >
              Değiştir
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-[15px] font-medium">Dil</h2>
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
          <h2 className="text-[15px] font-medium">Bildirimler</h2>
          <label className="mt-2 flex items-center gap-2 text-[15px]">
            <input type="checkbox" defaultChecked />
            Kritik issue uyarıları
          </label>
        </div>
      </div>

      <div
        className="mt-6 max-w-lg space-y-4 rounded-xl border bg-[var(--bg-surface-1)] p-5"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <h2 className="text-[15px] font-medium">Şifre</h2>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            Kendi şifrenizi değiştirin. Yönetici sıfırlaması bu sayfadan
            yapılmaz.
          </p>
        </div>
        {passwordSaved && (
          <p className="text-[13px]" style={{ color: 'var(--status-ok)' }}>
            Şifre güncellendi.
          </p>
        )}
        <ChangePasswordForm
          onSuccess={() => setPasswordSaved(true)}
          submitLabel="Şifreyi kaydet"
        />
      </div>
    </section>
  );
}

