import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';
import { roleDisplayName } from '../lib/roleLabels';

export default function NotAuthorizedPage() {
  const { t } = useI18n();
  const { logout, user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-page)] px-4 text-center">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
        {t('auth.noAccessTitle')}
      </h1>
      <p className="mt-2 max-w-md text-[15px] text-[var(--text-secondary)]">
        {t('auth.noWebAccess')}
        {user && (
          <>
            {' '}
            {t('auth.signedInAs', {
              email: user.Email,
              role: roleDisplayName(user.Role, t),
            })}
          </>
        )}
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={logout}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[15px] text-white"
        >
          {t('common.logout')}
        </button>
        <Link
          to="/login"
          className="rounded-lg border px-4 py-2 text-[15px] text-[var(--text-primary)]"
          style={{ borderColor: 'var(--border)' }}
        >
          {t('login.back')}
        </Link>
      </div>
    </div>
  );
}
