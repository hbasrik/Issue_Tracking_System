import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Perm } from './permissions';

/** Requires a logged-in user who holds web.access. */
export function RequireWebAccess() {
  const { isAuthenticated, has, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (user?.MustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }
  if (!has(Perm.WebAccess)) {
    return <Navigate to="/not-authorized" replace />;
  }
  return <Outlet />;
}

/** Nested route gate: the caller must hold `code` (backend still enforces). */
export function RequirePermission({ code }: { code: string }) {
  const { isAuthenticated, has } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!has(code)) {
    return <Navigate to="/not-authorized" replace />;
  }
  return <Outlet />;
}
