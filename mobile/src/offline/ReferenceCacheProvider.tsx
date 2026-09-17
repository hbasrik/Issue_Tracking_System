import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import type { Vehicle } from '../api/client';
import { useI18n } from '../i18n';
import { useAppOnline, subscribeConnectivity } from './connectivity';
import {
  EMPTY_SNAPSHOT,
  formatCacheAge,
  loadReferenceSnapshot,
  refreshReferenceSnapshot,
  searchCachedVehicles,
  snapshotIsStale,
  type ReferenceSnapshot,
} from './referenceCache';

interface ReferenceCacheValue {
  snapshot: ReferenceSnapshot;
  fromCache: boolean;
  ready: boolean;
  cacheAgeLabel: string | null;
  searchVehicles: (query: string) => Vehicle[];
  refresh: (force?: boolean) => Promise<void>;
}

const ReferenceCacheContext = createContext<ReferenceCacheValue | null>(null);

export function ReferenceCacheProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, token } = useAuth();
  const { t } = useI18n();
  const online = useAppOnline();
  const [snapshot, setSnapshot] = useState<ReferenceSnapshot>(EMPTY_SNAPSHOT);
  const [fromCache, setFromCache] = useState(false);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const refresh = useCallback(async (force = false) => {
    if (!tokenRef.current) return;
    const current =
      snapshotRef.current.fetchedAt
        ? snapshotRef.current
        : (await loadReferenceSnapshot()) ?? EMPTY_SNAPSHOT;
    if (
      !force &&
      !snapshotIsStale(current.fetchedAt, Date.now()) &&
      current.vehicles.length > 0
    ) {
      if (current.fetchedAt && current !== snapshotRef.current) {
        setSnapshot(current);
        setFromCache(true);
      }
      setReady(true);
      return;
    }
    try {
      const result = await refreshReferenceSnapshot(
        current.fetchedAt ? current : null,
      );
      setSnapshot(result.snap);
      setFromCache(result.fromCache);
      setNow(Date.now());
    } catch {
      const disk = current.fetchedAt ? current : await loadReferenceSnapshot();
      if (disk) {
        setSnapshot(disk);
        setFromCache(true);
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const disk = await loadReferenceSnapshot();
      if (cancelled) return;
      if (disk) {
        setSnapshot(disk);
        setFromCache(true);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    void refresh(true);
  }, [isAuthenticated, token, refresh]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const onApp = (state: AppStateStatus) => {
      if (state === 'active') void refresh(false);
    };
    const appSub = AppState.addEventListener('change', onApp);
    const unsub = subscribeConnectivity((isOnline) => {
      if (isOnline) void refresh(true);
    });
    return () => {
      appSub.remove();
      unsub();
    };
  }, [isAuthenticated, refresh]);

  const cacheAgeLabel = useMemo(() => {
    if (!snapshot.fetchedAt) return null;
    if (online && !fromCache) return null;
    return t('offline.cacheAge', {
      age: formatCacheAge(snapshot.fetchedAt, now, t),
    });
  }, [snapshot.fetchedAt, fromCache, online, now, t]);

  const searchVehicles = useCallback(
    (query: string) => searchCachedVehicles(snapshot.vehicles, query),
    [snapshot.vehicles],
  );

  const value = useMemo<ReferenceCacheValue>(
    () => ({
      snapshot,
      fromCache,
      ready,
      cacheAgeLabel,
      searchVehicles,
      refresh,
    }),
    [snapshot, fromCache, ready, cacheAgeLabel, searchVehicles, refresh],
  );

  return (
    <ReferenceCacheContext.Provider value={value}>
      {children}
    </ReferenceCacheContext.Provider>
  );
}

export function useReferenceCache(): ReferenceCacheValue {
  const ctx = useContext(ReferenceCacheContext);
  if (!ctx) {
    throw new Error('useReferenceCache must be used within ReferenceCacheProvider');
  }
  return ctx;
}
