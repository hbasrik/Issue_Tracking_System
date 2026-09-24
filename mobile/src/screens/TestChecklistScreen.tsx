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
  InfoText,
  Loading,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import { ActionStamp } from '../components/ActionStamp';
import { checklistActorLines } from '../lib/actionStamp';
import { apiErrorMessage } from '../lib/password';
import { loadFailureMessage } from '../offline/userFacingError';
import { isTransportError } from '../../../shared/networkError';
import {
  countActiveChecklistProgress,
  isChecklistStatusPassing,
  splitChecklistByActive,
} from '../../../shared/checklistActive';
import { useI18n } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';
import { groupChecklistSections } from '../lib/checklistSections';

/**
 * Test checklist (Karar 4) — the third checklist alongside EoL and Shipment.
 * It tracks end-of-line functional quality only: unlike the other two it gates
 * nothing, so completing it never moves the vehicle's status.
 */
export default function TestChecklistScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'TestChecklist'>>();
  const { tokens } = useTheme();
  const { t, locale } = useI18n();
  const vin = route.params.vin;

  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offlineHint, setOfflineHint] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [inactiveOpen, setInactiveOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setOfflineHint(null);
    try {
      const res = await api.getChecklist(vin, 'test');
      setItems(res.items ?? []);
    } catch (err) {
      if (isTransportError(err)) {
        setOfflineHint(t('offline.liveUnavailable'));
      } else {
        const split = loadFailureMessage(err, t);
        setError(split.error);
        setOfflineHint(split.offlineHint);
      }
    }
  }, [vin, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { active: activeItems, inactiveHistorical } = useMemo(
    () => splitChecklistByActive(items),
    [items],
  );
  const counts = useMemo(
    () => countActiveChecklistProgress(activeItems),
    [activeItems],
  );
  const { total, passing: completed, remaining } = counts;

  async function toggle(item: ChecklistItem) {
    if (isChecklistStatusPassing(item.Status)) return;
    setBusyId(item.ItemID);
    setError(null);
    try {
      await api.recordChecklist(vin, 'test', item.ItemID, { status: 'OK' });
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusyId(null);
    }
  }

  const grouped = useMemo(
    () => groupChecklistSections(activeItems, t),
    [activeItems, t],
  );

  if (!items.length && !error && !offlineHint) return <Loading />;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <Title>{t('nav.testChecklist')}</Title>
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
        {offlineHint ? <InfoText>{offlineHint}</InfoText> : null}

        {grouped.map((g) => (
          <View key={g.title} style={{ marginTop: 16 }}>
            <Text style={{ color: tokens.textSecondary, fontWeight: '600', fontSize: 13 }}>
              {g.title}
            </Text>
            {g.items.map((item) => {
              const checked = isChecklistStatusPassing(item.Status);
              return (
                <Pressable
                  key={item.ItemID}
                  onPress={() => toggle(item)}
                  disabled={busyId === item.ItemID}
                >
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

        {inactiveHistorical.length > 0 ? (
          <Card>
            <Pressable
              onPress={() => setInactiveOpen((o) => !o)}
              accessibilityRole="button"
              testID="checklist-inactive-toggle"
            >
              <Text style={{ color: tokens.textSecondary, fontWeight: '600', fontSize: 14 }}>
                {t('checklist.inactiveSection', { n: inactiveHistorical.length })}
                {inactiveOpen ? ' ▾' : ' ▸'}
              </Text>
            </Pressable>
            {inactiveOpen ? (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: tokens.textSecondary, fontSize: 12, marginBottom: 8 }}>
                  {t('checklist.inactiveHint')}
                </Text>
                {inactiveHistorical.map((item) => (
                  <View
                    key={item.ItemID}
                    style={{
                      marginTop: 8,
                      paddingVertical: 8,
                      borderTopWidth: 1,
                      borderTopColor: tokens.border,
                      opacity: 0.7,
                    }}
                  >
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <Text style={{ color: tokens.textPrimary, fontSize: 14, flex: 1 }}>
                        {item.ItemNo}. {item.ItemText}
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 999,
                          backgroundColor: tokens.border,
                        }}
                      >
                        <Text style={{ color: tokens.textSecondary, fontSize: 11, fontWeight: '700' }}>
                          {t('checklist.inactiveBadge')}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: tokens.textSecondary, fontSize: 12, marginTop: 4 }}>
                      {item.Status}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}
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
            color: remaining === 0 ? statusColors.ok : tokens.textSecondary,
            fontWeight: '600',
            fontSize: 13,
          }}
        >
          {remaining === 0
            ? t('checklist.allTestsDone')
            : t('checklist.testsRemaining', { n: remaining })}
        </Text>
        <Text style={{ color: tokens.textSecondary, marginTop: 6, fontSize: 12 }}>
          {t('checklist.testRecordHint')}
        </Text>
      </View>
    </Screen>
  );
}
