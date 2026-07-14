import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export default function NotAuthorizedPage() {
  const { logout, user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-page)] px-4 text-center">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
        Not authorized
      </h1>
      <p className="mt-2 max-w-md text-[15px] text-[var(--text-secondary)]">
        The web dashboard is restricted to Manager/Admin users.
        {user && (
          <>
            {' '}
            Signed in as <strong>{user.Email}</strong> ({user.Role}).
          </>
        )}
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={logout}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[15px] text-white"
        >
          Sign out
        </button>
        <Link
          to="/login"
          className="rounded-lg border px-4 py-2 text-[15px] text-[var(--text-primary)]"
          style={{ borderColor: 'var(--border)' }}
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}
