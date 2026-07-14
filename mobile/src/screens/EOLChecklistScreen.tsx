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
import { ApiError, api, type ChecklistItem } from '../api/client';
import {
  Card,
  ErrorText,
  Loading,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

const STATUSES = [
  { value: 'OK', label: 'OK', color: statusColors.ok },
  { value: 'NOT_OK', label: 'NOT OK', color: statusColors.notOk },
  { value: 'REWORK', label: 'REWORK', color: statusColors.rework },
  { value: 'CONDITIONAL_OK', label: 'COND.', color: statusColors.conditionalOk },
] as const;

function isPassing(s: ChecklistItem['Status']): boolean {
  return s === 'OK' || s === 'CONDITIONAL_OK';
}

function needsDesc(s: ChecklistItem['Status']): boolean {
  return s === 'NOT_OK' || s === 'REWORK' || s === 'CONDITIONAL_OK';
}

/** EoL checklist — §3.4 hard-block sticky footer. */
export default function EOLChecklistScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'EOLChecklist'>>();
  const { tokens } = useTheme();
  const vin = route.params.vin;

  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [drafts, setDrafts] = useState<Record<number, { status: string; desc: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.getChecklist(vin, 'eol');
      const list = res.items ?? [];
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
      setError(err instanceof Error ? err.message : 'Failed to load EoL checklist');
    }
  }, [vin]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const blocking = useMemo(
    () =>
      items.filter((it) => {
        const d = drafts[it.ItemID];
        const status = (d?.status || it.Status) as ChecklistItem['Status'];
        return !status || status === 'PENDING' || !isPassing(status);
      }),
    [items, drafts],
  );

  const evaluated = items.filter((it) => {
    const s = drafts[it.ItemID]?.status || it.Status;
    return s && s !== 'PENDING';
  }).length;

  async function saveItem(item: ChecklistItem) {
    const d = drafts[item.ItemID];
    if (!d?.status) {
      setError('Select a status');
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
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function requestExit() {
    if (blocking.length) {
      setSheetOpen(true);
      return;
    }
    // All passing — attempt gate exit on last item (or any item) with request_gate_exit
    const first = items[0];
    if (!first) return;
    setBusy(true);
    setError(null);
    try {
      const d = drafts[first.ItemID];
      await api.recordChecklist(vin, 'eol', first.ItemID, {
        status: d?.status || first.Status,
        request_gate_exit: true,
        rework_desc: first.ReworkDesc,
        conditional_desc: first.ConditionalDesc,
        rejected_desc: first.RejectedDesc,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSheetOpen(true);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Gate exit failed');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!items.length && !error) return <Loading />;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Title>EoL Kontrolü</Title>
        <Subtitle>
          {evaluated}/{items.length} değerlendirildi
        </Subtitle>
        {error ? <ErrorText>{error}</ErrorText> : null}

        {items.map((item) => {
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
                  style={{
                    marginTop: 10,
                    borderWidth: 1,
                    borderColor: statusColors.notOk,
                    borderRadius: 8,
                    padding: 10,
                    color: tokens.textPrimary,
                    fontSize: 15,
                    minHeight: 44,
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
      </ScrollView>

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
              marginBottom: 8,
              fontSize: 13,
            }}
          >
            {blocking.length ? `${blocking.length} madde engelliyor` : 'Çıkışa Hazır'}
          </Text>
        </Pressable>
        <PrimaryButton
          label="EoL'den Çıkar"
          onPress={requestExit}
          disabled={busy}
        />
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
              Engelleyen maddeler
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
