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
import {
  api,
  setTokenGetter,
  setUnauthorizedHandler,
  type User,
} from '../api/client';
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
  /** Set when a 401 cleared the session; LoginScreen shows login.sessionExpired. */
  sessionExpiredNotice: boolean;
  clearSessionExpiredNotice: () => void;
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
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);
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

  const clearSession = useCallback(() => {
    setPersist(false);
    void clearPersistedAuth();
    setToken(null);
    setUser(null);
    setPermissions([]);
    setActiveStationId(null);
  }, []);

  // Before child effects load data (avoids 401 racing an unset handler).
  useLayoutEffect(() => {
    setUnauthorizedHandler(() => {
      setSessionExpiredNotice(true);
      clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const clearSessionExpiredNotice = useCallback(() => {
    setSessionExpiredNotice(false);
  }, []);

  const login = useCallback(
    async (email: string, password: string, keepSignedIn = false) => {
      const res = await api.login(email, password);
      setSessionExpiredNotice(false);
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
    clearSession();
  }, [clearSession]);

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
      sessionExpiredNotice,
      clearSessionExpiredNotice,
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
      sessionExpiredNotice,
      clearSessionExpiredNotice,
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
