import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ChangePasswordForm } from '../components/ChangePasswordForm';

/** First-login gate: no other screen is reachable until the password is rotated. */
export default function ChangePasswordPage() {
  const { isAuthenticated, user, logout, markPasswordChanged } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!user?.MustChangePassword) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-page)] px-4">
      <div
        className="w-full max-w-sm rounded-xl border bg-[var(--bg-surface-1)] p-6"
        style={{ borderColor: 'var(--border)' }}
      >
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          Şifrenizi değiştirin
        </h1>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          İlk girişte veya yönetici sıfırlamasından sonra yeni bir şifre
          belirlemeniz gerekir. Başka bir ekrana geçilemez.
        </p>
        <div className="mt-6">
          <ChangePasswordForm onSuccess={markPasswordChanged} />
        </div>
        <button
          type="button"
          onClick={logout}
          className="mt-4 w-full min-h-touch rounded-lg border py-2.5 text-[15px]"
          style={{ borderColor: 'var(--border)' }}
        >
          Çıkış
        </button>
      </div>
    </div>
  );
}
