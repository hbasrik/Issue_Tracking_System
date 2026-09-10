import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/apiErrors';
import { useI18n } from '../i18n';

const UNDO_MS = 15_000;

export type ApprovalUndoKind = 'APPROVED' | 'CONDITIONAL_APPROVED';

type UndoToast = {
  issueId: number;
  kind: ApprovalUndoKind;
  expiresAt: number;
};

type UndoApprovalApi = {
  showAfterApproval: (issueId: number, kind: ApprovalUndoKind) => void;
  dismiss: () => void;
};

const UndoApprovalContext = createContext<UndoApprovalApi | null>(null);

/** App-level 15s undo banner after quality / conditional approval. */
export function useApprovalUndo(): UndoApprovalApi {
  const ctx = useContext(UndoApprovalContext);
  if (!ctx) {
    throw new Error('useApprovalUndo must be used within ApprovalUndoProvider');
  }
  return ctx;
}

export function ApprovalUndoProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toast, setToast] = useState<UndoToast | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const dismiss = useCallback(() => {
    setToast(null);
    setError(null);
    setBusy(false);
  }, []);

  const showAfterApproval = useCallback((issueId: number, kind: ApprovalUndoKind) => {
    setError(null);
    setBusy(false);
    setToast({
      issueId,
      kind,
      expiresAt: Date.now() + UNDO_MS,
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [toast]);

  useEffect(() => {
    if (!toast) return;
    if (now >= toast.expiresAt) {
      dismiss();
    }
  }, [now, toast, dismiss]);

  async function handleUndo() {
    if (!toast || busy) return;
    setBusy(true);
    setError(null);
    try {
      const issueId = toast.issueId;
      await api.undoIssueApproval(issueId);
      dismiss();
      window.dispatchEvent(
        new CustomEvent('karea:issue-approval-undone', {
          detail: { issueId },
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? apiErrorMessage(err, t) : t('issueDetail.undoFailed'));
      setBusy(false);
    }
  }

  const remainingMs = toast ? Math.max(0, toast.expiresAt - now) : 0;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const message =
    toast?.kind === 'CONDITIONAL_APPROVED'
      ? t('issueDetail.undoConditionalToast')
      : t('issueDetail.undoApproveToast');

  return (
    <UndoApprovalContext.Provider value={{ showAfterApproval, dismiss }}>
      {children}
      {toast
        ? createPortal(
            <div
              role="status"
              className="fixed bottom-4 left-1/2 z-[80] flex w-[min(36rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col gap-2 rounded-xl border px-4 py-3 shadow-lg"
              style={{
                backgroundColor: 'var(--bg-surface-1)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 text-[14px] font-medium">
                  {message}
                  <span className="ml-2 tabular-nums text-[13px] text-[var(--text-secondary)]">
                    {remainingSec}s
                  </span>
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleUndo()}
                  className="min-h-9 shrink-0 rounded-lg bg-[var(--accent)] px-3 text-[13px] font-medium text-white disabled:opacity-60"
                >
                  {busy ? t('common.updating') : t('issueDetail.undoAction')}
                </button>
              </div>
              {error ? (
                <p className="text-[12px]" style={{ color: 'var(--status-not-ok)' }}>
                  {error}
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </UndoApprovalContext.Provider>
  );
}
