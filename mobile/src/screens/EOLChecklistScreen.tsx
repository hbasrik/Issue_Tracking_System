import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  useFocusEffect,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path } from 'react-native-svg';
import {
  api,
  type ChecklistItem,
  type EOLStage,
  type EOLWorkflowView,
  type LocalFile,
} from '../api/client';
import {
  Card,
  ErrorText,
  InfoText,
  Loading,
  OutlineButton,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
  AppTextInput,
} from '../components/ui';
import {
  DismissKeyboardScrollView,
} from '../components/keyboard';
import { ActionStamp } from '../components/ActionStamp';
import { ChecklistItemPhotos } from '../components/ChecklistItemPhotos';
import { ChecklistCollapsedSection } from '../components/ChecklistCollapsedSection';
import { checklistActorLines } from '../lib/actionStamp';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n';
import { apiErrorMessage } from '../lib/password';
import { loadFailureMessage } from '../offline/userFacingError';
import { useAppOnline } from '../offline/connectivity';
import { prepareUploadImage } from '../lib/prepareUploadImage';
import { isTransportError } from '../../../shared/networkError';
import { statusColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';
import {
  branchShipGateReasons,
  deliverGateReasons,
  depotReleaseGateReasons,
} from '../../../shared/eolGates';
import {
  activeIncompleteChecklistItems,
  countActiveChecklistProgress,
  filterByEolPhase,
  splitChecklistByActive,
} from '../../../shared/checklistActive';
import type { MessageKey, Translate } from '../../../shared/i18n';
import { groupChecklistSections } from '../lib/checklistSections';
import { checklistCriteriaLines } from '../../../shared/checklistCriteria';

const STATUS_KEYS = [
  { value: 'OK', key: 'status.eol.ok' as const, color: statusColors.ok },
  { value: 'NOT_OK', key: 'status.eol.notOk' as const, color: statusColors.notOk },
  { value: 'REWORK', key: 'status.eol.rework' as const, color: statusColors.rework },
  { value: 'CONDITIONAL_OK', key: 'status.eol.conditionalOk' as const, color: statusColors.conditionalOk },
];

function stageLabel(stage: EOLStage, t: Translate): string {
  const keys: Record<EOLStage, MessageKey> = {
    BRANCH: 'status.eolStage.branch',
    DEPOT: 'status.eolStage.depot',
    DOCUMENT: 'checklist.documentShort',
    COMPLETED: 'status.eolStage.completed',
  };
  return t(keys[stage]);
}

function ChevronIcon({ color, open }: { color: string; open: boolean }) {
  return (
    <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="m6 9 6 6 6-6" />
      </Svg>
    </View>
  );
}

function InfoIcon({ color, label }: { color: string; label: string }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} aria-label={label} testID="eol-criteria-icon">
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <Path d="M12 16v-4" />
        <Path d="M12 8h.01" />
      </Svg>
    </View>
  );
}

function needsDesc(s: ChecklistItem['Status']): boolean {
  return s === 'NOT_OK' || s === 'REWORK' || s === 'CONDITIONAL_OK';
}

/**
 * EoL checklist — operator marks items; managers run Fabrika → Depo → Teslim
 * actions when every gate checklist is complete.
 */
export default function EOLChecklistScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'EOLChecklist'>>();
  const { tokens } = useTheme();
  const { t, locale } = useI18n();
  const { has } = useAuth();
  const vin = route.params.vin;

  const [workflow, setWorkflow] = useState<EOLWorkflowView | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [drafts, setDrafts] = useState<Record<number, { status: string; desc: string }>>({});
  const [photos, setPhotos] = useState<Record<number, LocalFile>>({});
  const [itemError, setItemError] = useState<{ itemId: number; message: string } | null>(null);
  const [editingIds, setEditingIds] = useState<Record<number, boolean>>({});
  const online = useAppOnline();
  const [error, setError] = useState<string | null>(null);
  const [offlineHint, setOfflineHint] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setOfflineHint(null);
    try {
      const [view, res] = await Promise.all([
        api.getEOLWorkflow(vin),
        api.getChecklist(vin, 'eol'),
      ]);
      const list = res.items ?? [];
      setWorkflow(view);
      setItems(list);
      const next: Record<number, { status: string; desc: string }> = {};
      for (const it of list) {
        next[it.ItemID] = {
          status: it.Status === 'PENDING' ? '' : it.Status,
          desc: it.Note ?? '',
        };
      }
      setDrafts(next);
    } catch (err) {
      if (isTransportError(err)) {
        setOfflineHint(t('offline.liveUnavailable'));
      } else {
        const split = loadFailureMessage(err, t);
        setError(split.error);
        setOfflineHint(split.offlineHint);
      }
    } finally {
      setLoaded(true);
    }
  }, [vin, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const stage = workflow?.current_stage ?? 'BRANCH';
  const operatorStage = stage === 'BRANCH' || stage === 'DEPOT';

  const stageItems = useMemo(() => {
    if (!operatorStage) return [] as ChecklistItem[];
    return filterByEolPhase(items, stage as 'BRANCH' | 'DEPOT');
  }, [items, stage, operatorStage]);

  const { active: activeItems, stageClosed, inactiveHistorical } = useMemo(
    () => splitChecklistByActive(stageItems),
    [stageItems],
  );

  const grouped = useMemo(() => {
    if (!activeItems.some((i) => Boolean(i.SectionKey?.trim()))) {
      return [{ key: '__flat', title: null as string | null, items: activeItems }];
    }
    return groupChecklistSections(activeItems, t);
  }, [activeItems, t]);

  const counts = useMemo(() => {
    const base = countActiveChecklistProgress(activeItems);
    const evaluated = activeItems.filter((it) => {
      const s = drafts[it.ItemID]?.status || it.Status;
      return Boolean(s && s !== 'PENDING');
    }).length;
    return { ...base, evaluated };
  }, [activeItems, drafts]);

  const blocking = useMemo(
    () =>
      activeIncompleteChecklistItems(activeItems, (it) => drafts[it.ItemID]?.status),
    [activeItems, drafts],
  );

  const canShip = has(Perm.EOLBranchShip) && Boolean(workflow?.gates?.branch_ship.ready);
  const shipReasons = branchShipGateReasons(
    workflow?.gates?.branch_ship,
    has(Perm.EOLBranchShip),
  ).map((r) => t(r.key, r.params));

  const canRelease =
    has(Perm.EOLDepotRelease) && Boolean(workflow?.gates?.depot_release.ready);
  const releaseReasons = depotReleaseGateReasons(
    workflow?.gates?.depot_release,
    has(Perm.EOLDepotRelease),
  ).map((r) => t(r.key, r.params));

  const canDeliver = has(Perm.EOLDeliver) && Boolean(workflow?.gates?.deliver.ready);
  const deliverReasons = deliverGateReasons(
    workflow?.gates?.deliver,
    has(Perm.EOLDeliver),
  ).map((r) => t(r.key, r.params));

  async function saveItem(item: ChecklistItem) {
    const fail = (message: string) => setItemError({ itemId: item.ItemID, message });
    const d = drafts[item.ItemID];
    if (!d?.status) {
      fail(t('checklist.pickStatusShort'));
      return;
    }
    if (needsDesc(d.status as ChecklistItem['Status']) && !d.desc.trim()) {
      fail(t('checklist.descRequired'));
      return;
    }
    const photo = photos[item.ItemID];
    setBusy(true);
    setItemError(null);
    try {
      await api.recordChecklist(vin, 'eol', item.ItemID, {
        status: d.status,
        note: d.desc.trim(),
      });
    } catch (err) {
      fail(apiErrorMessage(err, t));
      setBusy(false);
      return;
    }
    let uploadError: string | null = null;
    if (photo) {
      try {
        if (!item.ProgressID) throw new Error(t('checklist.noProgressId'));
        await api.uploadMedia('CHECKLIST_ITEM_PROGRESS', String(item.ProgressID), photo);
        setPhotos((prev) => {
          const next = { ...prev };
          delete next[item.ItemID];
          return next;
        });
      } catch (err) {
        uploadError = t('checklist.photoUploadFailed', { reason: apiErrorMessage(err, t) });
      }
    }
    await load();
    if (uploadError) fail(uploadError);
    else setEditing(item.ItemID, false);
    setBusy(false);
  }

  function setEditing(itemId: number, on: boolean) {
    setEditingIds((prev) => ({ ...prev, [itemId]: on }));
  }

  function cancelEdit(item: ChecklistItem) {
    setDrafts((prev) => ({
      ...prev,
      [item.ItemID]: { status: item.Status === 'PENDING' ? '' : item.Status, desc: item.Note ?? '' },
    }));
    setPhotos((prev) => {
      const next = { ...prev };
      delete next[item.ItemID];
      return next;
    });
    setItemError(null);
    setEditing(item.ItemID, false);
  }

  async function pickPhoto(itemId: number, source: 'camera' | 'library') {
    const fail = (message: string) => setItemError({ itemId, message });
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      fail(t(source === 'camera' ? 'issueDetail.cameraDenied' : 'issueDetail.galleryDenied'));
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    try {
      const file = await prepareUploadImage(asset);
      setPhotos((prev) => ({ ...prev, [itemId]: file }));
    } catch (err) {
      fail(apiErrorMessage(err, t));
    }
  }

  async function runShip() {
    setBusy(true);
    setError(null);
    try {
      await api.eolBranchShip(vin);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function runRelease() {
    setBusy(true);
    setError(null);
    try {
      await api.eolDepotRelease(vin);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function runDeliver() {
    setBusy(true);
    setError(null);
    try {
      await api.eolDeliver(vin);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <Loading />;

  const workflowStages = [
    {
      title: t('checklist.shipFromBranch'),
      record: workflow?.branch_ship,
      showAction: !workflow?.branch_ship?.at,
      actionLabel: t('eol.shipBranch'),
      enabled: canShip,
      reasons: shipReasons,
      onAction: runShip,
    },
    {
      title: t('checklist.releaseFromDepot'),
      record: workflow?.depot_release,
      showAction: !workflow?.depot_release?.at,
      actionLabel: t('eol.releaseDepot'),
      enabled: canRelease,
      reasons: releaseReasons,
      onAction: runRelease,
    },
    {
      title: t('eol.deliver'),
      record: workflow?.deliver,
      showAction: !workflow?.deliver?.at,
      actionLabel: t('eol.deliver'),
      enabled: canDeliver,
      reasons: deliverReasons,
      onAction: runDeliver,
    },
  ] as const;

  function renderStageActions() {
    return workflowStages.map((row) => (
      <Card key={row.title}>
        <Text style={{ color: tokens.textPrimary, fontWeight: '600', fontSize: 15 }}>
          {row.title}
        </Text>
        <ActionStamp name={row.record?.by_name} at={row.record?.at} />
        {row.showAction ? (
          <View style={{ marginTop: 10 }}>
            <PrimaryButton
              label={row.actionLabel}
              onPress={() => void row.onAction()}
              disabled={busy || !row.enabled}
            />
            {!row.enabled && row.reasons.length > 0 ? (
              <View style={{ marginTop: 6 }}>
                {row.reasons.map((reason) => (
                  <Text
                    key={reason}
                    style={{ color: tokens.textSecondary, fontSize: 12, marginTop: 2 }}
                  >
                    {reason}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>
    ));
  }

  if (!operatorStage) {
    return (
      <Screen>
        <Title>{t('nav.eolChecklist')}</Title>
        <Subtitle>{stageLabel(stage, t)}</Subtitle>
        <Card>
          <Text style={{ color: tokens.textPrimary, fontSize: 15 }}>
            {t('eol.completed')}
          </Text>
        </Card>
        {renderStageActions()}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {offlineHint ? <InfoText>{offlineHint}</InfoText> : null}
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <DismissKeyboardScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Title>{t('nav.eolChecklist')}</Title>
        <Subtitle>
          {stageLabel(stage, t)} ·{' '}
          {t('checklist.evaluated', {
            done: counts.evaluated,
            total: counts.total,
          })}
        </Subtitle>
        {renderStageActions()}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {offlineHint ? <InfoText>{offlineHint}</InfoText> : null}

        {grouped.map((g) => (
          <View key={g.key} testID={`eol-section-${g.key}`}>
            {g.title ? (
              <Text
                style={{ color: tokens.textSecondary, fontWeight: '600', fontSize: 13, marginTop: 16 }}
              >
                {g.title}
              </Text>
            ) : null}
            {g.items.map((item) => {
              const d = drafts[item.ItemID] ?? { status: '', desc: '' };
              const answered = item.Status !== 'PENDING';
              const open = editingIds[item.ItemID] ?? !answered;
              const s = STATUS_KEYS.find((k) => k.value === item.Status);
              const label = s ? t(s.key) : t('status.eol.pending');
              const pillColor = s?.color ?? tokens.textSecondary;
              const note = (item.Note ?? '').trim();
              const criteria = checklistCriteriaLines(item, 'edit');
              const recordCriteria = checklistCriteriaLines(item, 'record');
              const header = (
                <Pressable
                  onPress={() => setEditing(item.ItemID, !open)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  aria-expanded={open}
                  accessibilityLabel={`${item.ItemNo}. ${item.ItemText} — ${label}`}
                  testID={`eol-item-header-${item.ItemID}`}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    minHeight: 48,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    backgroundColor: pressed || hovered ? tokens.bgSurface2 : 'transparent',
                  })}
                >
                  <Text style={{ flex: 1, color: tokens.textPrimary, fontSize: 15 }}>
                    {item.ItemNo}. {item.ItemText}
                  </Text>
                  {!open && recordCriteria.length > 0 ? (
                    <InfoIcon color={tokens.textSecondary} label={t('checklist.hasCriteria')} />
                  ) : null}
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: pillColor,
                      backgroundColor: pillColor + '33',
                    }}
                  >
                    <Text style={{ color: pillColor, fontSize: 11, fontWeight: '700' }}>{label}</Text>
                  </View>
                  <ChevronIcon color={tokens.textSecondary} open={open} />
                </Pressable>
              );
              if (!open) {
                const hasBody = answered;
                return (
                  <Card key={item.ItemID} style={{ padding: 0, overflow: 'hidden' }}>
                    <View testID={`eol-answered-${item.ItemID}`}>
                      {header}
                      {hasBody ? (
                        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
                          {note ? (
                            <Text style={{ color: tokens.textSecondary, fontSize: 13 }}>
                              {t('checklist.noteLabel', { note })}
                            </Text>
                          ) : null}
                          <ActionStamp lines={checklistActorLines(item, t, locale)} />
                          <ChecklistItemPhotos photos={item.Photos ?? []} />
                        </View>
                      ) : null}
                    </View>
                  </Card>
                );
              }
              return (
                <Card key={item.ItemID} style={{ padding: 0, overflow: 'hidden' }}>
                  {header}
                  <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                    {criteria.length > 0 ? (
                      <View
                        testID={`eol-criteria-${item.ItemID}`}
                        style={{ backgroundColor: tokens.bgPage, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}
                      >
                        {criteria.map((line) => (
                          <View key={line.kind} testID={`eol-criteria-${line.kind}-${item.ItemID}`}>
                            <Text style={{ color: tokens.textSecondary, fontSize: 12, fontWeight: '600' }}>
                              {t(line.labelKey)}
                            </Text>
                            <Text style={{ color: tokens.textSecondary, fontSize: 13, lineHeight: 18 }}>
                              {line.text}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <ChecklistItemPhotos photos={item.Photos ?? []} />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {STATUS_KEYS.map((s) => {
                        const selected = d.status === s.value;
                        return (
                          <Pressable
                            key={s.value}
                            onPress={() =>
                              setDrafts((prev) => ({
                                ...prev,
                                [item.ItemID]: { ...d, status: s.value },
                              }))
                            }
                            style={{
                              paddingHorizontal: 10,
                              minHeight: 36,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: selected ? s.color : tokens.border,
                              backgroundColor: selected ? s.color + '33' : 'transparent',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ color: selected ? s.color : tokens.textSecondary, fontSize: 11, fontWeight: '600' }}>
                              {t(s.key)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {d.status ? (
                      <AppTextInput
                        value={d.desc}
                        onChangeText={(text) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.ItemID]: { ...d, desc: text },
                          }))
                        }
                        placeholder={
                          needsDesc(d.status as ChecklistItem['Status'])
                            ? t('checklist.descRequiredStar')
                            : t('checklist.noteOptionalPlaceholder')
                        }
                        placeholderTextColor={tokens.textSecondary}
                        multiline
                        numberOfLines={3}
                        style={{
                          marginTop: 10,
                          borderWidth: 1,
                          borderColor: needsDesc(d.status as ChecklistItem['Status'])
                            ? statusColors.notOk
                            : tokens.border,
                          borderRadius: 8,
                          padding: 10,
                          color: tokens.textPrimary,
                          fontSize: 15,
                          minHeight: 80,
                          textAlignVertical: 'top',
                        }}
                      />
                    ) : null}
                    <View style={{ marginTop: 10, gap: 8 }}>
                      <OutlineButton
                        label={
                          photos[item.ItemID]
                            ? t('report.pickedGallery', { name: photos[item.ItemID].name })
                            : t('report.pickGallery')
                        }
                        onPress={() => void pickPhoto(item.ItemID, 'library')}
                        disabled={busy}
                      />
                      <OutlineButton
                        label={t('report.takePhoto')}
                        onPress={() => void pickPhoto(item.ItemID, 'camera')}
                        disabled={busy}
                      />
                      {!online ? <InfoText>{t('checklist.photoOffline')}</InfoText> : null}
                    </View>
                    {itemError?.itemId === item.ItemID ? (
                      <ErrorText>{itemError.message}</ErrorText>
                    ) : null}
                    <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                      {answered ? (
                        <View style={{ flexBasis: 120, flexShrink: 1 }}>
                          <OutlineButton
                            label={t('common.cancel')}
                            onPress={() => cancelEdit(item)}
                            disabled={busy}
                          />
                        </View>
                      ) : null}
                      <View style={{ flexBasis: 120, flexShrink: 1 }}>
                        <PrimaryButton
                          label={busy ? t('common.saving') : t('common.save')}
                          onPress={() => saveItem(item)}
                          disabled={busy}
                        />
                      </View>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        ))}

        <ChecklistCollapsedSection
          title={t('checklist.stageClosedSection', { n: stageClosed.length })}
          hint={t('checklist.stageClosedHint')}
          badge={t('checklist.stageClosedBadge')}
          items={stageClosed}
          testID="checklist-stage-closed-toggle"
          itemTestIDPrefix="checklist-stage-closed-"
        />
        <ChecklistCollapsedSection
          title={t('checklist.inactiveSection', { n: inactiveHistorical.length })}
          hint={t('checklist.inactiveHint')}
          badge={t('checklist.inactiveBadge')}
          items={inactiveHistorical}
          testID="checklist-inactive-toggle"
          itemTestIDPrefix="checklist-inactive-"
        />
      </DismissKeyboardScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: 16,
          borderTopWidth: 1,
          borderTopColor: tokens.border,
          backgroundColor: tokens.bgSurface1,
        }}
      >
        <Pressable onPress={() => blocking.length && setSheetOpen(true)}>
          <Text
            style={{
              color: blocking.length ? statusColors.notOk : statusColors.ok,
              fontWeight: '600',
              fontSize: 13,
            }}
          >
            {blocking.length
              ? t('checklist.itemsMissing', { n: blocking.length })
              : t('checklist.stageComplete')}
          </Text>
        </Pressable>
      </View>

      <Modal visible={sheetOpen} animationType="slide" transparent>
        <Pressable
          style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}
          onPress={() => setSheetOpen(false)}
        >
          <View
            style={{
              backgroundColor: tokens.bgSurface1,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 20,
              maxHeight: '60%',
            }}
          >
            <Text style={{ color: tokens.textPrimary, fontSize: 18, fontWeight: '600' }}>
              {t('checklist.missingItems')}
            </Text>
            <ScrollView style={{ marginTop: 12 }}>
              {blocking.map((b) => (
                <Text
                  key={b.ItemID}
                  style={{ color: tokens.textSecondary, marginBottom: 8, fontSize: 14 }}
                >
                  #{b.ItemNo} {b.ItemText}
                </Text>
              ))}
            </ScrollView>
            <PrimaryButton label={t('common.close')} onPress={() => setSheetOpen(false)} />
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}
