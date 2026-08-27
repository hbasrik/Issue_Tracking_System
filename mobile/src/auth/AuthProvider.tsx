import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, setTokenGetter, type User } from '../api/client';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  permissions: string[];
  isAuthenticated: boolean;
  has: (code: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  markPasswordChanged: () => void;
  activeStationId: number | null;
  setActiveStationId: (id: number | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** In-memory auth only (no persistent storage) for this session. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [activeStationId, setActiveStationId] = useState<number | null>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;

  useLayoutEffect(() => {
    setTokenGetter(() => tokenRef.current);
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setTokenGetter(() => res.token);
    setToken(res.token);
    setUser(res.user);
    setPermissions(res.permissions ?? []);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setPermissions([]);
    setActiveStationId(null);
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
      activeStationId,
      setActiveStationId,
    }),
    [user, token, permissions, has, login, logout, markPasswordChanged, activeStationId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
