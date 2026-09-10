import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { space, statusColors } from '../theme/tokens';

export type ConfirmTone = 'default' | 'danger' | 'warning';

export type ConfirmRequest = {
  title: string;
  message: string;
  mode?: 'confirm' | 'alert';
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmFn = (req: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Promise-based in-app confirm — do not use native Alert.alert for approvals. */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return fn;
}

type Pending = ConfirmRequest & { resolve: (value: boolean) => void };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback<ConfirmFn>((req) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...req, resolve });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setPending((cur) => {
      cur?.resolve(value);
      return null;
    });
  }, []);

  const tone = pending?.tone ?? 'default';
  const confirmBg =
    tone === 'danger'
      ? statusColors.notOk
      : tone === 'warning'
        ? statusColors.conditionalOk
        : tokens.accent;
  const confirmFg = tone === 'warning' ? '#111' : '#fff';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal visible={Boolean(pending)} transparent animationType="fade" onRequestClose={() => close(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            justifyContent: 'center',
            padding: space[4],
          }}
        >
          <View
            style={{
              borderRadius: 14,
              backgroundColor: tokens.bgSurface1,
              borderWidth: 1,
              borderColor: tokens.border,
              padding: space[4],
              gap: space[3],
            }}
          >
            <Text style={{ color: tokens.textPrimary, fontSize: 17, fontWeight: '700' }}>
              {pending?.title}
            </Text>
            <Text style={{ color: tokens.textSecondary, fontSize: 15, lineHeight: 22 }}>
              {pending?.message}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: space[2] }}>
              {(pending?.mode ?? 'confirm') === 'confirm' ? (
                <Pressable
                  onPress={() => close(false)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: tokens.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: tokens.textPrimary, fontWeight: '600' }}>
                    {pending?.cancelLabel ?? t('common.cancel')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => close(true)}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 10,
                  backgroundColor: confirmBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: confirmFg, fontWeight: '700' }}>
                  {pending?.confirmLabel ??
                    (pending?.mode === 'alert' ? t('common.close') : t('common.confirm'))}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ConfirmContext.Provider>
  );
}
