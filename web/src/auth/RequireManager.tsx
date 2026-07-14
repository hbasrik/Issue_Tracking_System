import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';

/** Requires a logged-in user with MANAGER_ADMIN role. */
export function RequireManager() {
  const { isAuthenticated, isManager } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!isManager) {
    return <Navigate to="/not-authorized" replace />;
  }
  return <Outlet />;
}
