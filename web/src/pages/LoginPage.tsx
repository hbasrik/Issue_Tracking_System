import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ApiError } from '../lib/api';

export default function LoginPage() {
  const { login, isAuthenticated, isManager } = useAuth();
  const [email, setEmail] = useState('manager@karea.local');
  const [password, setPassword] = useState('changeme123');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isAuthenticated && isManager) {
    return <Navigate to="/" replace />;
  }
  if (isAuthenticated && !isManager) {
    return <Navigate to="/not-authorized" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-page)] px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border bg-[var(--bg-surface-1)] p-6"
        style={{ borderColor: 'var(--border)' }}
      >
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          Karea
        </h1>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          Manager / Admin sign in
        </p>
        <label className="mt-6 block text-[13px] text-[var(--text-secondary)]">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px] text-[var(--text-primary)]"
            style={{ borderColor: 'var(--border)' }}
          />
        </label>
        <label className="mt-4 block text-[13px] text-[var(--text-secondary)]">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px] text-[var(--text-primary)]"
            style={{ borderColor: 'var(--border)' }}
          />
        </label>
        {error && (
          <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-[var(--accent)] py-2.5 text-[15px] font-medium text-white disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
