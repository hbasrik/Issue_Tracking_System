import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setTokenGetter, type User } from '../lib/api';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  permissions: string[];
  isAuthenticated: boolean;
  has: (code: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  markPasswordChanged: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** In-memory auth only (no localStorage) for this session. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    setTokenGetter(() => token);
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setToken(res.token);
    setUser(res.user);
    setPermissions(res.permissions ?? []);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setPermissions([]);
  }, []);

  const markPasswordChanged = useCallback(() => {
    setUser((current) =>
      current ? { ...current, MustChangePassword: false } : null,
    );
  }, []);

  const has = useCallback(
    (code: string) => permissions.includes(code),
    [permissions],
  );

  const value = useMemo(
    () => ({
      user,
      token,
      permissions,
      isAuthenticated: !!token && !!user,
      has,
      login,
      logout,
      markPasswordChanged,
    }),
    [user, token, permissions, has, login, logout, markPasswordChanged],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
