import { Text, View } from 'react-native';
import { useI18n } from '../i18n';
import type { Translate } from '../../../shared/i18n';
import { useTheme } from '../theme/ThemeProvider';
import { useConfirm } from '../components/ConfirmDialog';
import {
  Card,
  ErrorText,
  InfoText,
  OutlineButton,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import { DismissKeyboardScrollView } from '../components/keyboard';
import { useIssueReportQueue } from '../offline/IssueReportQueueProvider';
import type { QueuedIssueReport } from '../lib/issueReportQueue';
import { isExpired } from '../lib/issueReportQueuePolicy';
import { isTransportError } from '../../../shared/networkError';
import { statusColors } from '../theme/tokens';

function statusLabel(item: QueuedIssueReport, t: Translate): string {
  if (item.status === 'sending') return t('queue.sending');
  if (item.status === 'failed') return t('queue.failed');
  return t('queue.pending');
}

function statusColor(item: QueuedIssueReport): string {
  if (item.status === 'sending') return statusColors.info;
  if (item.status === 'failed') return statusColors.notOk;
  return statusColors.issueOpen;
}

function isWaitingConnection(item: QueuedIssueReport): boolean {
  if (item.lastErrorCode === 'network') return true;
  if (item.status !== 'failed') return false;
  return isTransportError(item.lastError ? new Error(item.lastError) : null);
}

function errorText(item: QueuedIssueReport, t: Translate): string | null {
  if (item.lastErrorCode === 'expired' || isExpired(item.createdAt, Date.now())) {
    return t('queue.expired');
  }
  if (item.lastErrorCode === 'photo' || item.lastError === 'queued photo missing') {
    return t('queue.noPhoto');
  }
  if (isWaitingConnection(item)) return null;
  return item.lastError ?? null;
}

export default function PendingReportsScreen() {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const confirm = useConfirm();
  const { items, flushing, flush, remove } = useIssueReportQueue();

  async function onDelete(id: string) {
    const ok = await confirm({
      title: t('queue.delete'),
      message: t('queue.deleteConfirm'),
      tone: 'danger',
      confirmLabel: t('common.confirmDelete'),
    });
    if (ok) await remove(id);
  }

  return (
    <Screen padded={false}>
      <DismissKeyboardScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Title>{t('nav.pendingReports')}</Title>
        <Subtitle>{t('queue.ageHint')}</Subtitle>

        {items.length === 0 ? (
          <Subtitle>{t('queue.empty')}</Subtitle>
        ) : (
          <View style={{ marginTop: 8 }}>
            <PrimaryButton
              label={flushing ? t('common.saving') : t('queue.sendAll')}
              onPress={() => void flush({ force: true })}
              disabled={flushing}
            />
          </View>
        )}

        {items.map((item) => {
          const color = statusColor(item);
          const err = errorText(item, t);
          const waiting = isWaitingConnection(item) || item.status === 'pending';
          return (
            <Card key={item.id}>
              <View style={{ gap: 8 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <Text style={{ color: tokens.textPrimary, fontWeight: '600', flex: 1 }}>
                    {t('queue.vin', { vin: item.payload.vin })}
                  </Text>
                  <Text style={{ color, fontWeight: '600', fontSize: 12 }}>
                    {statusLabel(item, t)}
                  </Text>
                </View>
                <Text style={{ color: tokens.textSecondary, fontSize: 13 }}>
                  {item.payload.description}
                </Text>
                {item.issueId != null ? (
                  <Text style={{ color: tokens.textSecondary, fontSize: 12 }}>
                    #{item.issueId}
                    {item.photoUploaded
                      ? ''
                      : ` · ${t('queue.photoPending')}`}
                  </Text>
                ) : null}
                {waiting && !err ? (
                  <InfoText>{t('queue.waitingConnection')}</InfoText>
                ) : null}
                {err ? <ErrorText>{err}</ErrorText> : null}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton
                      label={t('queue.sendNow')}
                      onPress={() => void flush({ id: item.id, force: true })}
                      disabled={flushing || item.status === 'sending'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <OutlineButton
                      label={t('queue.delete')}
                      onPress={() => {
                        if (item.status === 'sending') return;
                        void onDelete(item.id);
                      }}
                    />
                  </View>
                </View>
              </View>
            </Card>
          );
        })}
      </DismissKeyboardScrollView>
    </Screen>
  );
}
