import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { PASSWORD_RULE_HINT, passwordErrorMessage } from '../lib/password';

const fieldClass =
  'mt-1 w-full rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px] text-[var(--text-primary)]';

/** Current + new + confirm. Used on the forced first-login page and Settings. */
export function ChangePasswordForm({
  onSuccess,
  submitLabel = 'Şifreyi değiştir',
}: {
  onSuccess: () => void;
  submitLabel?: string;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Yeni şifre ve tekrarı eşleşmiyor.');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onSuccess();
    } catch (err) {
      setError(
        err instanceof ApiError ? passwordErrorMessage(err) : 'Şifre değiştirilemedi',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-[13px] text-[var(--text-secondary)]">{PASSWORD_RULE_HINT}</p>
      <label className="block text-[13px] text-[var(--text-secondary)]">
        Mevcut şifre
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoComplete="current-password"
          className={fieldClass}
          style={{ borderColor: 'var(--border)' }}
        />
      </label>
      <label className="block text-[13px] text-[var(--text-secondary)]">
        Yeni şifre
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className={fieldClass}
          style={{ borderColor: 'var(--border)' }}
        />
      </label>
      <label className="block text-[13px] text-[var(--text-secondary)]">
        Yeni şifre (tekrar)
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className={fieldClass}
          style={{ borderColor: 'var(--border)' }}
        />
      </label>
      {error && (
        <p className="text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="min-h-touch w-full rounded-lg bg-[var(--accent)] py-2.5 text-[15px] font-medium text-white disabled:opacity-60"
      >
        {busy ? 'Kaydediliyor…' : submitLabel}
      </button>
    </form>
  );
}
