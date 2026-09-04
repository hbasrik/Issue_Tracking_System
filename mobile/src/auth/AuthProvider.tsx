import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, setTokenGetter, type User } from '../api/client';
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
  /** False until SecureStore hydrate finishes (avoids login flash). */
  ready: boolean;
  has: (code: string) => boolean;
  login: (email: string, password: string, keepSignedIn?: boolean) => Promise<void>;
  logout: () => void;
  markPasswordChanged: () => void;
  activeStationId: number | null;
  setActiveStationId: (id: number | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Auth with optional SecureStore persistence when "keep signed in" is checked.
 * Unchecked login stays in-memory only (previous default).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [activeStationId, setActiveStationId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [persist, setPersist] = useState(false);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;

  useLayoutEffect(() => {
    setTokenGetter(() => tokenRef.current);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadPersistedAuth();
      if (cancelled) return;
      if (saved) {
        setTokenGetter(() => saved.token);
        setToken(saved.token);
        setUser(saved.user);
        setPermissions(saved.permissions ?? []);
        setPersist(true);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!persist || !token || !user) return;
    void savePersistedAuth({ token, user, permissions });
  }, [persist, token, user, permissions]);

  const login = useCallback(
    async (email: string, password: string, keepSignedIn = false) => {
      const res = await api.login(email, password);
      setTokenGetter(() => res.token);
      setToken(res.token);
      setUser(res.user);
      setPermissions(res.permissions ?? []);
      if (keepSignedIn) {
        setPersist(true);
        await savePersistedAuth({
          token: res.token,
          user: res.user,
          permissions: res.permissions ?? [],
        });
      } else {
        setPersist(false);
        await clearPersistedAuth();
      }
    },
    [],
  );

  const logout = useCallback(() => {
    setPersist(false);
    void clearPersistedAuth();
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
      ready,
      has,
      login,
      logout,
      markPasswordChanged,
      activeStationId,
      setActiveStationId,
    }),
    [
      user,
      token,
      permissions,
      ready,
      has,
      login,
      logout,
      markPasswordChanged,
      activeStationId,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
