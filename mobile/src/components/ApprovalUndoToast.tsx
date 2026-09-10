import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, Text, View, DeviceEventEmitter } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { useI18n } from '../i18n';
import { apiErrorMessage } from '../lib/password';
import { useTheme } from '../theme/ThemeProvider';
import { space, statusColors } from '../theme/tokens';

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

export function useApprovalUndo(): UndoApprovalApi {
  const ctx = useContext(UndoApprovalContext);
  if (!ctx) {
    throw new Error('useApprovalUndo must be used within ApprovalUndoProvider');
  }
  return ctx;
}

/** App-level 15s undo banner after quality / conditional approval. */
export function ApprovalUndoProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
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
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
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
      await api.undoIssueApproval(toast.issueId);
      const undoneId = toast.issueId;
      dismiss();
      DeviceEventEmitter.emit('karea:issue-approval-undone', { issueId: undoneId });
    } catch (err) {
      setError(err instanceof Error ? apiErrorMessage(err, t) : t('issueDetail.undoFailed'));
      setBusy(false);
    }
  }

  const remainingSec = toast ? Math.ceil(Math.max(0, toast.expiresAt - now) / 1000) : 0;
  const message =
    toast?.kind === 'CONDITIONAL_APPROVED'
      ? t('issueDetail.undoConditionalToast')
      : t('issueDetail.undoApproveToast');

  return (
    <UndoApprovalContext.Provider value={{ showAfterApproval, dismiss }}>
      {children}
      {toast ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: space[3],
            right: space[3],
            bottom: Math.max(insets.bottom, 12) + 8,
            zIndex: 100,
          }}
        >
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: tokens.border,
              backgroundColor: tokens.bgSurface1,
              paddingHorizontal: space[3],
              paddingVertical: space[3],
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, color: tokens.textPrimary, fontSize: 14, fontWeight: '600' }}>
                {message}
                <Text style={{ color: tokens.textSecondary, fontWeight: '500' }}>
                  {' '}
                  {remainingSec}s
                </Text>
              </Text>
              <Pressable
                disabled={busy}
                onPress={() => void handleUndo()}
                style={{
                  minHeight: 40,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: tokens.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                  {busy ? t('common.updating') : t('issueDetail.undoAction')}
                </Text>
              </Pressable>
            </View>
            {error ? (
              <Text style={{ color: statusColors.notOk, fontSize: 12 }}>{error}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </UndoApprovalContext.Provider>
  );
}
