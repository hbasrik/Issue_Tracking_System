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
import {
  deleteQueuedReport,
  flushQueue,
  loadQueue,
  QueueLimitError,
  submitOrQueueIssueReport,
  type IssueReportPayload,
  type QueuedIssueReport,
} from '../lib/issueReportQueue';
import type { LocalFile } from '../api/client';

type EnqueueResult = {
  sent: boolean;
  item?: QueuedIssueReport;
  authExpired?: boolean;
};

interface QueueContextValue {
  items: QueuedIssueReport[];
  pendingCount: number;
  flushing: boolean;
  enqueue: (
    payload: IssueReportPayload,
    photo: LocalFile | null,
  ) => Promise<EnqueueResult>;
  flush: (opts?: { id?: string; force?: boolean }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const QueueContext = createContext<QueueContextValue | null>(null);

const POLL_MS = 30_000;

/**
 * Flush when the app returns to the foreground and every 30s while open.
 * A failed fetch (timeout / TypeError) keeps the row queued; the next
 * successful attempt is the connectivity signal. NetInfo was skipped so
 * Expo Go does not need an extra native module.
 */

export function IssueReportQueueProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, token } = useAuth();
  const userId = user?.ID ?? null;
  const [items, setItems] = useState<QueuedIssueReport[]>([]);
  const [flushing, setFlushing] = useState(false);
  const flushLock = useRef(false);

  const refresh = useCallback(async () => {
    if (userId == null) {
      setItems([]);
      return;
    }
    setItems(await loadQueue(userId));
  }, [userId]);

  const flush = useCallback(
    async (opts?: { id?: string; force?: boolean }) => {
      if (userId == null || !token) return;
      if (flushLock.current) {
        if (!opts?.force) return;
        while (flushLock.current) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      flushLock.current = true;
      setFlushing(true);
      try {
        const next = await flushQueue(userId, opts);
        setItems(next);
      } finally {
        flushLock.current = false;
        setFlushing(false);
        await refresh();
      }
    },
    [userId, token, refresh],
  );

  const enqueue = useCallback(
    async (
      payload: IssueReportPayload,
      photo: LocalFile | null,
    ): Promise<EnqueueResult> => {
      if (userId == null) {
        throw new Error('not authenticated');
      }
      const outcome = await submitOrQueueIssueReport(userId, payload, photo);
      if (outcome.kind === 'rejected') {
        throw outcome.error;
      }
      await refresh();
      if (outcome.kind === 'sent') {
        return { sent: true };
      }
      return {
        item: outcome.item,
        sent: false,
        authExpired: outcome.authExpired,
      };
    },
    [userId, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      if (userId == null) return;
      setItems(await deleteQueuedReport(userId, id));
    },
    [userId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isAuthenticated || userId == null) return;
    void flush();

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') void flush();
    };
    const appSub = AppState.addEventListener('change', onAppState);
    const timer = setInterval(() => {
      void flush();
    }, POLL_MS);

    return () => {
      appSub.remove();
      clearInterval(timer);
    };
  }, [isAuthenticated, userId, flush]);

  const value = useMemo<QueueContextValue>(
    () => ({
      items,
      pendingCount: items.length,
      flushing,
      enqueue,
      flush,
      remove,
    }),
    [items, flushing, enqueue, flush, remove],
  );

  return (
    <QueueContext.Provider value={value}>{children}</QueueContext.Provider>
  );
}

export function useIssueReportQueue(): QueueContextValue {
  const ctx = useContext(QueueContext);
  if (!ctx) {
    throw new Error('useIssueReportQueue must be used within IssueReportQueueProvider');
  }
  return ctx;
}

export { QueueLimitError };
