import { useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
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
import {
  DefectClassificationFields,
  defectClassificationValidationMessage,
  isDefectClassificationComplete,
  type DefectClassificationState,
} from '../components/DefectClassificationFields';
import { useIssueReportQueue } from '../offline/IssueReportQueueProvider';
import { useReferenceCache } from '../offline/ReferenceCacheProvider';
import type { DefectPart, DefectType } from '../api/client';
import type { QueuedIssueReport } from '../lib/issueReportQueue';
import { isExpired, isStoredAuthFailure } from '../lib/issueReportQueuePolicy';
import { translateApiError } from '../../../shared/i18n';
import { isOtherPartCode, isOtherTypeCode } from '../../../shared/issueDefectValidation';
import {
  catalogRejection,
  type CatalogRejection,
} from '../../../shared/queueCatalogRejection';
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
  if (item.lastErrorCode === 'auth') return false;
  if (item.status !== 'failed') return false;
  return false;
}

function rejectionText(kind: CatalogRejection, t: Translate): string {
  if (kind === 'part') return t('queue.catalogPartRemoved');
  if (kind === 'type') return t('queue.catalogTypeRemoved');
  if (kind === 'both') return t('queue.catalogBothRemoved');
  return t('queue.catalogChanged');
}

function errorText(item: QueuedIssueReport, t: Translate): string | null {
  if (item.status === 'sending') return null;
  if (item.lastErrorCode === 'expired' || isExpired(item.createdAt, Date.now())) {
    return t('queue.expired');
  }
  if (item.lastErrorCode === 'photo' || item.lastError === 'queued photo missing') {
    return t('queue.noPhoto');
  }
  if (item.lastErrorCode === 'auth' || isStoredAuthFailure(item.lastError)) {
    return t('queue.sessionExpired');
  }
  if (isWaitingConnection(item)) return null;
  if (item.lastError) {
    // 'http' = the server rejected the payload (4xx); unmapped text must not show raw.
    const stored = Object.assign(new Error(item.lastError), {
      status: item.lastErrorCode === 'http' ? 400 : undefined,
    });
    return translateApiError(t, stored);
  }
  return null;
}

/** Starting point of the fix form: still-selectable values are kept, removed ones cleared. */
function initialClassification(
  item: QueuedIssueReport,
  parts: DefectPart[],
  types: DefectType[],
): DefectClassificationState {
  const part = parts.find((p) => p.ID === item.payload.defect_part_id);
  const type = types.find((ty) => ty.ID === item.payload.defect_type_id);
  return {
    zoneId: part?.ZoneID ?? null,
    partId: part?.ID ?? null,
    typeId: type?.ID ?? null,
    customPartName: item.payload.custom_part_name ?? '',
    customDefectName: item.payload.custom_defect_name ?? '',
  };
}

export default function PendingReportsScreen() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const { items, flushing, flush, remove } = useIssueReportQueue();
  const { snapshot } = useReferenceCache();

  // Same selectable set the report form offers (zone active, part active).
  const selectable = useMemo(() => {
    const zoneIds = new Set(snapshot.zones.map((z) => z.ID));
    const parts = snapshot.parts.filter(
      (p) => zoneIds.has(p.ZoneID) && p.ZoneIsActive !== false,
    );
    return {
      parts,
      types: snapshot.types,
      catalog: {
        loaded: Boolean(snapshot.fetchedAt) && snapshot.parts.length > 0,
        partIds: new Set(parts.map((p) => p.ID)),
        typeIds: new Set(snapshot.types.map((ty) => ty.ID)),
      },
    };
  }, [snapshot]);

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

        {items.map((item) => (
          <QueuedReportCard
            key={item.id}
            item={item}
            rejection={catalogRejection(item, selectable.catalog)}
            parts={selectable.parts}
            types={selectable.types}
            onSend={() => void flush({ id: item.id, force: true })}
            onDelete={() => {
              if (item.status === 'sending') return;
              void onDelete(item.id);
            }}
          />
        ))}
      </DismissKeyboardScrollView>
    </Screen>
  );
}

function QueuedReportCard({
  item,
  rejection,
  parts,
  types,
  onSend,
  onDelete,
}: {
  item: QueuedIssueReport;
  rejection: CatalogRejection | null;
  parts: DefectPart[];
  types: DefectType[];
  onSend: () => void;
  onDelete: () => void;
}) {
  const { t, locale } = useI18n();
  const { tokens } = useTheme();
  const { reclassify } = useIssueReportQueue();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DefectClassificationState | null>(null);
  const [catalogParts, setCatalogParts] = useState<DefectPart[]>(parts);
  const [catalogTypes, setCatalogTypes] = useState<DefectType[]>(types);
  const [saving, setSaving] = useState(false);

  const color = statusColor(item);
  const err = rejection ? rejectionText(rejection, t) : errorText(item, t);
  const waiting =
    item.status !== 'sending' &&
    (isWaitingConnection(item) || item.status === 'pending');
  const draftMessage = draft
    ? defectClassificationValidationMessage(draft, catalogParts, catalogTypes, t)
    : null;
  const draftReady =
    draft != null && isDefectClassificationComplete(draft, catalogParts, catalogTypes);

  function openEditor() {
    setDraft(initialClassification(item, parts, types));
    setEditing(true);
  }

  async function saveAndResend() {
    if (!draft || !draftReady || draft.partId == null || draft.typeId == null) return;
    const part = catalogParts.find((p) => p.ID === draft.partId);
    const type = catalogTypes.find((ty) => ty.ID === draft.typeId);
    setSaving(true);
    try {
      await reclassify(item.id, {
        defect_part_id: draft.partId,
        defect_type_id: draft.typeId,
        custom_part_name: isOtherPartCode(part?.Code) ? draft.customPartName.trim() : undefined,
        custom_defect_name: isOtherTypeCode(type?.Code) ? draft.customDefectName.trim() : undefined,
      });
      setEditing(false);
      setDraft(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <View style={{ gap: 8 }} testID={`queued-report-${item.id}`}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ color: tokens.textPrimary, fontWeight: '600', flex: 1 }}>
            {t('queue.vin', { vin: item.payload.vin })}
          </Text>
          <Text style={{ color, fontWeight: '600', fontSize: 12 }}>
            {statusLabel(item, t)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          {item.photoUri ? (
            <Image
              source={{ uri: item.photoUri }}
              accessibilityLabel={t('queue.photoAttached')}
              style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: tokens.border }}
            />
          ) : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: tokens.textSecondary, fontSize: 13 }}>
              {item.payload.description}
            </Text>
            {item.photoUri ? (
              <Text style={{ color: tokens.textSecondary, fontSize: 12 }}>
                {t('queue.photoAttached')}
              </Text>
            ) : null}
          </View>
        </View>
        {item.issueId != null ? (
          <Text style={{ color: tokens.textSecondary, fontSize: 12 }}>
            #{item.issueId}
            {item.photoUploaded ? '' : ` · ${t('queue.photoPending')}`}
          </Text>
        ) : null}
        {waiting && !err ? <InfoText>{t('queue.waitingConnection')}</InfoText> : null}
        {err ? <ErrorText>{err}</ErrorText> : null}

        {editing && draft ? (
          <View testID="queue-fix-form">
            <DefectClassificationFields
              zoneId={draft.zoneId}
              partId={draft.partId}
              typeId={draft.typeId}
              customPartName={draft.customPartName}
              customDefectName={draft.customDefectName}
              onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
              locale={locale}
              onCatalogLoaded={(p, ty) => {
                setCatalogParts(p);
                setCatalogTypes(ty);
              }}
            />
            <InfoText>{t('queue.fixKeepsData')}</InfoText>
            {draftMessage ? <InfoText>{draftMessage}</InfoText> : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label={saving ? t('common.saving') : t('queue.saveAndResend')}
                  onPress={() => void saveAndResend()}
                  disabled={saving || !draftReady}
                />
              </View>
              <View style={{ flex: 1 }}>
                <OutlineButton
                  label={t('common.cancel')}
                  onPress={() => {
                    setEditing(false);
                    setDraft(null);
                  }}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              {rejection ? (
                <PrimaryButton
                  label={t('queue.fixClassification')}
                  onPress={openEditor}
                  disabled={item.status === 'sending'}
                />
              ) : (
                <PrimaryButton
                  label={t('queue.sendNow')}
                  onPress={onSend}
                  disabled={item.status === 'sending'}
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <OutlineButton label={t('queue.delete')} onPress={onDelete} />
            </View>
          </View>
        )}
      </View>
    </Card>
  );
}
