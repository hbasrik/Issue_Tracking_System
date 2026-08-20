import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  api,
  setTokenGetter,
  type User,
  type UserRole,
} from '../api/client';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isOperator: boolean;
  activeStationId: number | null;
  setActiveStationId: (id: number | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** In-memory auth only (no persistent storage) for this session. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [activeStationId, setActiveStationId] = useState<number | null>(null);

  useEffect(() => {
    setTokenGetter(() => token);
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    // Bind the getter before React re-renders Home, otherwise the first
    // listIssues call races the useEffect below and goes out without a Bearer
    // token (cards stay at 0 until pull-to-refresh).
    setTokenGetter(() => res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setActiveStationId(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: !!token && !!user,
      isOperator: user?.Role === ('OPERATOR' as UserRole),
      activeStationId,
      setActiveStationId,
      login,
      logout,
    }),
    [user, token, activeStationId, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
