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
import {
  clearPersistedAuth,
  loadPersistedAuth,
  savePersistedAuth,
} from './persistedSession';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  permissions: string[];
  isAuthenticated: boolean;
  has: (code: string) => boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  markPasswordChanged: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readInitialAuth() {
  if (typeof window === 'undefined') return null;
  return loadPersistedAuth();
}

/** Session in memory; optional localStorage when "remember me" is checked. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const initial = readInitialAuth();
  const [user, setUser] = useState<User | null>(initial?.user ?? null);
  const [token, setToken] = useState<string | null>(initial?.token ?? null);
  const [permissions, setPermissions] = useState<string[]>(
    initial?.permissions ?? [],
  );
  const [persistence, setPersistence] = useState<'none' | 'local'>(() =>
    initial ? 'local' : 'none',
  );

  // Sync before child effects (e.g. HomePage load) so the first API call
  // does not race an unset token getter after a hard reload.
  setTokenGetter(() => token);

  useEffect(() => {
    if (persistence !== 'local' || !token || !user) return;
    savePersistedAuth({ token, user, permissions });
  }, [persistence, token, user, permissions]);

  const login = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      const res = await api.login(email, password);
      setToken(res.token);
      setUser(res.user);
      setPermissions(res.permissions ?? []);
      if (rememberMe) {
        setPersistence('local');
        savePersistedAuth({
          token: res.token,
          user: res.user,
          permissions: res.permissions ?? [],
        });
      } else {
        setPersistence('none');
        clearPersistedAuth();
      }
    },
    [],
  );

  const logout = useCallback(() => {
    setPersistence('none');
    clearPersistedAuth();
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
