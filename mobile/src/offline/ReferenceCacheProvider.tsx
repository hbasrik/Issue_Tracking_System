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
  /** Always-on "catalogue updated … ago" line for the manual refresh control. */
  catalogAgeLabel: string | null;
  refreshing: boolean;
  searchVehicles: (query: string) => Vehicle[];
  refresh: (force?: boolean) => Promise<void>;
}

const ReferenceCacheContext = createContext<ReferenceCacheValue | null>(null);

/**
 * While the app is open the snapshot is checked this often and refetched once
 * it is REFERENCE_REFRESH_MS (15 min) old; the same tick keeps the age label
 * current. Background apps do not tick; returning to the foreground refreshes.
 */
export const FOREGROUND_CHECK_MS = 60_000;

export function ReferenceCacheProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, token } = useAuth();
  const { t } = useI18n();
  const online = useAppOnline();
  const [snapshot, setSnapshot] = useState<ReferenceSnapshot>(EMPTY_SNAPSHOT);
  const [fromCache, setFromCache] = useState(false);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const runRefresh = useCallback(async (force: boolean) => {
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
    setRefreshing(true);
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
      setRefreshing(false);
      setReady(true);
    }
  }, []);

  const refresh = useCallback(
    (force = false) => {
      if (inFlight.current) return inFlight.current;
      const run = runRefresh(force).finally(() => {
        inFlight.current = null;
      });
      inFlight.current = run;
      return run;
    },
    [runRefresh],
  );

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

  useEffect(() => {
    if (!isAuthenticated) return;
    const id = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      const nowMs = Date.now();
      setNow(nowMs);
      if (snapshotIsStale(snapshotRef.current.fetchedAt, nowMs)) void refresh(true);
    }, FOREGROUND_CHECK_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, refresh]);

  const cacheAgeLabel = useMemo(() => {
    if (!snapshot.fetchedAt) return null;
    if (online && !fromCache) return null;
    return t('offline.cacheAge', {
      age: formatCacheAge(snapshot.fetchedAt, now, t),
    });
  }, [snapshot.fetchedAt, fromCache, online, now, t]);

  const catalogAgeLabel = useMemo(() => {
    if (!snapshot.fetchedAt) return null;
    const age = formatCacheAge(snapshot.fetchedAt, now, t);
    return age === t('offline.justNow')
      ? t('catalog.updatedJustNow')
      : t('catalog.updatedAgo', { age });
  }, [snapshot.fetchedAt, now, t]);

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
      catalogAgeLabel,
      refreshing,
      searchVehicles,
      refresh,
    }),
    [snapshot, fromCache, ready, cacheAgeLabel, catalogAgeLabel, refreshing, searchVehicles, refresh],
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
