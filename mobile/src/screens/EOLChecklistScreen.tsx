import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  useFocusEffect,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import {
  ApiError,
  api,
  type ChecklistItem,
  type EOLStage,
  type EOLWorkflowView,
} from '../api/client';
import {
  Card,
  ErrorText,
  Loading,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import {
  DismissKeyboardScrollView,
  iosDoneAccessoryProps,
} from '../components/keyboard';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

const STATUSES = [
  { value: 'OK', label: 'OK', color: statusColors.ok },
  { value: 'NOT_OK', label: 'NOT OK', color: statusColors.notOk },
  { value: 'REWORK', label: 'REWORK', color: statusColors.rework },
  { value: 'CONDITIONAL_OK', label: 'COND.', color: statusColors.conditionalOk },
] as const;

const STAGE_LABELS: Record<EOLStage, string> = {
  BRANCH: 'Şube (Branch)',
  DEPOT: 'Depo (Depot)',
  DOCUMENT: 'Evrak (Document)',
  COMPLETED: 'Tamamlandı',
};

function isPassing(s: ChecklistItem['Status']): boolean {
  return s === 'OK' || s === 'CONDITIONAL_OK';
}

function needsDesc(s: ChecklistItem['Status']): boolean {
  return s === 'NOT_OK' || s === 'REWORK' || s === 'CONDITIONAL_OK';
}

/**
 * EoL checklist — the operator's slice of the three-stage workflow (Karar 2).
 *
 * Only the items belonging to the vehicle's current stage are shown: BRANCH
 * items while it sits at the branch, DEPOT items once it has been shipped.
 * Advancing the stage itself (Ship to Depot / Release from Depot / document
 * approval) is Manager/Admin work on the web dashboard, so this screen offers
 * no action beyond recording item results.
 */
export default function EOLChecklistScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'EOLChecklist'>>();
  const { tokens } = useTheme();
  const vin = route.params.vin;

  const [workflow, setWorkflow] = useState<EOLWorkflowView | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [drafts, setDrafts] = useState<Record<number, { status: string; desc: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setError(null);
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
      setError(err instanceof Error ? err.message : 'EoL listesi yüklenemedi');
    } finally {
      setLoaded(true);
    }
  }, [vin]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const stage = workflow?.current_stage ?? 'BRANCH';
  const operatorStage = stage === 'BRANCH' || stage === 'DEPOT';

  // Items carry the stage they belong to. An untagged item is shown in every
  // operator stage rather than dropped, so a mis-seeded template can never
  // hide work from the shop floor.
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

  async function saveItem(item: ChecklistItem) {
    const d = drafts[item.ItemID];
    if (!d?.status) {
      setError('Durum seçin');
      return;
    }
    if (needsDesc(d.status as ChecklistItem['Status']) && !d.desc.trim()) {
      setError('Description required for non-OK statuses');
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
      setError(err instanceof ApiError ? err.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <Loading />;

  if (!operatorStage) {
    return (
      <Screen>
        <Title>EoL Kontrolü</Title>
        <Subtitle>{STAGE_LABELS[stage]}</Subtitle>
        <Card>
          <Text style={{ color: tokens.textPrimary, fontSize: 15 }}>
            {stage === 'COMPLETED'
              ? 'EoL süreci tamamlandı.'
              : 'Evrak onayı bekleniyor.'}
          </Text>
          <Text style={{ color: tokens.textSecondary, marginTop: 8, fontSize: 13 }}>
            Bu aşamada operatör için madde yok — onay web panelinden yapılır.
          </Text>
        </Card>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <DismissKeyboardScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Title>EoL Kontrolü</Title>
        <Subtitle>
          {STAGE_LABELS[stage]} · {evaluated}/{stageItems.length} değerlendirildi
        </Subtitle>
        {error ? <ErrorText>{error}</ErrorText> : null}

        {stageItems.map((item) => {
          const d = drafts[item.ItemID] ?? { status: '', desc: '' };
          return (
            <Card key={item.ItemID}>
              <Text style={{ color: tokens.textPrimary, fontSize: 15 }}>
                {item.ItemNo}. {item.ItemText}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {STATUSES.map((s) => {
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
                        {s.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {needsDesc(d.status as ChecklistItem['Status']) ? (
                <TextInput
                  value={d.desc}
                  onChangeText={(text) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [item.ItemID]: { ...d, desc: text },
                    }))
                  }
                  placeholder="Açıklama zorunlu *"
                  placeholderTextColor={tokens.textSecondary}
                  multiline
                  numberOfLines={3}
                  {...iosDoneAccessoryProps}
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
                  label={busy ? 'Saving…' : 'Save item'}
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
              ? `${blocking.length} madde eksik`
              : 'Bu aşamanın tüm maddeleri tamam'}
          </Text>
        </Pressable>
        <Text style={{ color: tokens.textSecondary, marginTop: 6, fontSize: 12 }}>
          Aşama geçişi (sevk / depo çıkışı) web panelinden yapılır.
        </Text>
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
              Eksik maddeler
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
            <PrimaryButton label="Kapat" onPress={() => setSheetOpen(false)} />
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}
