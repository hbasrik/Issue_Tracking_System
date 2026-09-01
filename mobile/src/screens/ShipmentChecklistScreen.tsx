import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  useFocusEffect,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { api, type ChecklistItem } from '../api/client';
import {
  Card,
  ErrorText,
  Loading,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import { ActionStamp } from '../components/ActionStamp';
import { checklistActorLines } from '../lib/actionStamp';
import { apiErrorMessage } from '../lib/password';
import { useI18n } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';
import type { MessageKey } from '../../../shared/i18n';

const SECTIONS: { titleKey: MessageKey; from: number; to: number }[] = [
  { titleKey: 'checklist.section.identity', from: 1, to: 6 },
  { titleKey: 'checklist.section.exterior', from: 7, to: 16 },
  { titleKey: 'checklist.section.locks', from: 17, to: 20 },
  { titleKey: 'checklist.section.lighting', from: 21, to: 27 },
  { titleKey: 'checklist.section.interior', from: 28, to: 35 },
  { titleKey: 'checklist.section.charge', from: 36, to: 43 },
];

function isDone(s: ChecklistItem['Status']): boolean {
  return s === 'OK' || s === 'CONDITIONAL_OK';
}

/** Shipment checklist — §3.5 checkbox list, locked until all complete. */
export default function ShipmentChecklistScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ShipmentChecklist'>>();
  const { tokens } = useTheme();
  const { t, locale } = useI18n();
  const vin = route.params.vin;

  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.getChecklist(vin, 'shipment');
      setItems(res.items ?? []);
    } catch (err) {
      setError(apiErrorMessage(err, t));
    }
  }, [vin, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const total = items.length || 43;
  const completed = items.filter((i) => isDone(i.Status)).length;
  const remaining = total - completed;
  const allDone = total > 0 && completed === total;

  async function toggle(item: ChecklistItem) {
    if (isDone(item.Status)) return;
    setBusyId(item.ItemID);
    setError(null);
    try {
      await api.recordChecklist(vin, 'shipment', item.ItemID, { status: 'OK' });
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusyId(null);
    }
  }

  const grouped = useMemo(() => {
    return SECTIONS.map((sec) => ({
      ...sec,
      items: items.filter((i) => i.ItemNo >= sec.from && i.ItemNo <= sec.to),
    })).filter((g) => g.items.length > 0);
  }, [items]);

  if (!items.length && !error) return <Loading />;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Title>{t('nav.shipmentChecklist')}</Title>
        <Subtitle>
          {t('checklist.progress', { done: completed, total })}
        </Subtitle>

        <View
          style={{
            height: 8,
            borderRadius: 4,
            backgroundColor: tokens.border,
            marginTop: 12,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${total ? (completed / total) * 100 : 0}%`,
              height: '100%',
              backgroundColor: tokens.accent,
            }}
          />
        </View>

        {error ? <ErrorText>{error}</ErrorText> : null}

        {grouped.map((g) => (
          <View key={g.titleKey} style={{ marginTop: 16 }}>
            <Text style={{ color: tokens.textSecondary, fontWeight: '600', fontSize: 13 }}>
              {t(g.titleKey)}
            </Text>
            {g.items.map((item) => {
              const checked = isDone(item.Status);
              return (
                <Pressable key={item.ItemID} onPress={() => toggle(item)} disabled={busyId === item.ItemID}>
                  <Card>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          borderWidth: 2,
                          borderColor: checked ? statusColors.ok : tokens.border,
                          backgroundColor: checked ? statusColors.ok : 'transparent',
                        }}
                      />
                      <Text style={{ color: tokens.textPrimary, flex: 1, fontSize: 15 }}>
                        {item.ItemNo}. {item.ItemText}
                      </Text>
                    </View>
                    <ActionStamp lines={checklistActorLines(item, t, locale)} />
                  </Card>
                </Pressable>
              );
            })}
          </View>
        ))}
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
        <Text
          style={{
            color: allDone ? statusColors.ok : tokens.textSecondary,
            fontWeight: '600',
            marginBottom: 8,
            fontSize: 13,
          }}
        >
          {allDone ? t('checklist.readyToShip') : t('checklist.itemsRemaining', { n: remaining })}
        </Text>
        <PrimaryButton
          label={t('checklist.sendShipment')}
          onPress={() => {
            if (!allDone) {
              setError(t('checklist.shipmentRemaining', { n: remaining }));
            } else {
              setError(t('checklist.operatorHint'));
            }
          }}
          disabled={!allDone}
        />
      </View>
    </Screen>
  );
}
