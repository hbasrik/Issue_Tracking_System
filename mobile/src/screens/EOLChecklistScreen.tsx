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
import {
  api,
  type ChecklistItem,
  type EOLStage,
  type EOLWorkflowView,
} from '../api/client';
import {
  Card,
  ErrorText,
  InfoText,
  Loading,
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
import { checklistActorLines } from '../lib/actionStamp';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n';
import { apiErrorMessage } from '../lib/password';
import { loadFailureMessage } from '../offline/userFacingError';
import { isTransportError } from '../../../shared/networkError';
import { statusColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';
import {
  branchShipGateReasons,
  deliverGateReasons,
  depotReleaseGateReasons,
} from '../../../shared/eolGates';
import type { MessageKey, Translate } from '../../../shared/i18n';

const STATUS_KEYS = [
  { value: 'OK', key: 'status.eol.ok' as const, color: statusColors.ok },
  { value: 'NOT_OK', key: 'status.eol.notOk' as const, color: statusColors.notOk },
  { value: 'REWORK', key: 'status.eol.rework' as const, color: statusColors.rework },
  { value: 'CONDITIONAL_OK', key: 'checklist.conditionalShort' as const, color: statusColors.conditionalOk },
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

function isPassing(s: ChecklistItem['Status']): boolean {
  return s === 'OK' || s === 'CONDITIONAL_OK';
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
          desc: it.ReworkDesc || it.ConditionalDesc || it.RejectedDesc || '',
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

  const stageItems = useMemo(
    () =>
      operatorStage
        ? items.filter((it) => !it.EolPhase || it.EolPhase === stage)
        : [],
    [items, stage, operatorStage],
  );

  const blocking = useMemo(
    () =>
      stageItems.filter((it) => {
        const d = drafts[it.ItemID];
        const status = (d?.status || it.Status) as ChecklistItem['Status'];
        return !status || status === 'PENDING' || !isPassing(status);
      }),
    [stageItems, drafts],
  );

  const evaluated = stageItems.filter((it) => {
    const s = drafts[it.ItemID]?.status || it.Status;
    return s && s !== 'PENDING';
  }).length;

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
    const d = drafts[item.ItemID];
    if (!d?.status) {
      setError(t('checklist.pickStatusShort'));
      return;
    }
    if (needsDesc(d.status as ChecklistItem['Status']) && !d.desc.trim()) {
      setError(t('checklist.descRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: {
        status: string;
        rework_desc?: string;
        conditional_desc?: string;
        rejected_desc?: string;
      } = { status: d.status };
      if (d.status === 'REWORK') body.rework_desc = d.desc.trim();
      if (d.status === 'CONDITIONAL_OK') body.conditional_desc = d.desc.trim();
      if (d.status === 'NOT_OK') body.rejected_desc = d.desc.trim();
      await api.recordChecklist(vin, 'eol', item.ItemID, body);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
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
          {stageLabel(stage, t)} · {t('checklist.evaluated', { done: evaluated, total: stageItems.length })}
        </Subtitle>
        {renderStageActions()}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {offlineHint ? <InfoText>{offlineHint}</InfoText> : null}

        {stageItems.map((item) => {
          const d = drafts[item.ItemID] ?? { status: '', desc: '' };
          return (
            <Card key={item.ItemID}>
              <Text style={{ color: tokens.textPrimary, fontSize: 15 }}>
                {item.ItemNo}. {item.ItemText}
              </Text>
              <ActionStamp lines={checklistActorLines(item, t, locale)} />
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
              {needsDesc(d.status as ChecklistItem['Status']) ? (
                <AppTextInput
                  value={d.desc}
                  onChangeText={(text) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [item.ItemID]: { ...d, desc: text },
                    }))
                  }
                  placeholder={t('checklist.descRequiredStar')}
                  placeholderTextColor={tokens.textSecondary}
                  multiline
                  numberOfLines={3}
                  style={{
                    marginTop: 10,
                    borderWidth: 1,
                    borderColor: statusColors.notOk,
                    borderRadius: 8,
                    padding: 10,
                    color: tokens.textPrimary,
                    fontSize: 15,
                    minHeight: 80,
                    textAlignVertical: 'top',
                  }}
                />
              ) : null}
              <View style={{ marginTop: 10 }}>
                <PrimaryButton
                  label={busy ? t('common.saving') : t('common.save')}
                  onPress={() => saveItem(item)}
                  disabled={busy}
                />
              </View>
            </Card>
          );
        })}
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
