import { useCallback, useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  Text,
  UIManager,
  View,
} from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  api,
  type CheckpointItem,
  type Vehicle,
} from '../api/client';
import { ProgressRing } from '../components/ProgressRing';
import {
  Badge,
  Card,
  ErrorText,
  Loading,
  OutlineButton,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function checkpointColor(status: CheckpointItem['Status']): string {
  if (status === 'OK') return statusColors.ok;
  if (status === 'NOT_OK') return statusColors.notOk;
  return statusColors.pending;
}

export default function VehiclePhaseScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'VehiclePhase'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tokens } = useTheme();
  const vin = route.params.vin;

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointItem[]>([]);
  const [openByPhase, setOpenByPhase] = useState<Record<string, number>>({});
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [v, cp] = await Promise.all([
        api.getVehicle(vin),
        api.getCheckpoints(vin),
      ]);
      setVehicle(v);
      setCheckpoints(cp.Items ?? []);
      setOpenByPhase(cp.OpenIssuesByPhase ?? {});
      setExpandedPhase((prev) => prev ?? v.CurrentPhase);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicle');
    }
  }, [vin]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const byPhase = useMemo(() => {
    const map = new Map<number, CheckpointItem[]>();
    for (let p = 1; p <= 8; p++) map.set(p, []);
    for (const c of checkpoints) {
      const list = map.get(c.PhaseNumber) ?? [];
      list.push(c);
      map.set(c.PhaseNumber, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.SequenceNo - b.SequenceNo);
    }
    return map;
  }, [checkpoints]);

  async function setStatus(cp: CheckpointItem, status: 'OK' | 'NOT_OK') {
    setBusyId(cp.ID);
    setError(null);
    try {
      await api.recordCheckpoint(vin, cp.ID, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update checkpoint');
    } finally {
      setBusyId(null);
    }
  }

  function togglePhase(p: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedPhase((cur) => (cur === p ? null : p));
  }

  if (!vehicle && !error) return <Loading />;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Title>Faz İlerleme</Title>
        <Subtitle>{vin}</Subtitle>

        <View style={{ alignItems: 'center', marginVertical: 20 }}>
          <ProgressRing percent={vehicle?.TotalProgressPercentage ?? 0} />
          <Text style={{ color: tokens.textSecondary, marginTop: 8, fontSize: 13 }}>
            Model #{vehicle?.VehicleModelID} · Phase {vehicle?.CurrentPhase}/8
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <PrimaryButton
            label="EoL Checklist"
            onPress={() => navigation.navigate('EOLChecklist', { vin })}
          />
        </View>
        <View style={{ marginBottom: 16 }}>
          <OutlineButton
            label="Shipment Checklist"
            onPress={() => navigation.navigate('ShipmentChecklist', { vin })}
          />
        </View>

        {error ? <ErrorText>{error}</ErrorText> : null}

        {[1, 2, 3, 4, 5, 6, 7, 8].map((phase) => {
          const items = byPhase.get(phase) ?? [];
          const openCount = openByPhase[String(phase)] ?? 0;
          const active = phase === vehicle?.CurrentPhase;
          const done = items.length > 0 && items.every((i) => i.Status === 'OK');
          const expanded = expandedPhase === phase;

          return (
            <Card key={phase}>
              <Pressable onPress={() => togglePhase(phase)} style={{ minHeight: 44 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      borderWidth: active ? 3 : 1,
                      borderColor: done ? statusColors.ok : active ? tokens.accent : tokens.border,
                      backgroundColor: done ? statusColors.ok : 'transparent',
                    }}
                  />
                  <Text style={{ color: tokens.textPrimary, fontWeight: '600', flex: 1 }}>
                    Phase {phase}
                  </Text>
                  {/* Soft-warning: open issue badge — informational only, never blocks */}
                  {openCount > 0 ? (
                    <Badge label={`${openCount} open`} color={statusColors.notOk} />
                  ) : null}
                </View>
              </Pressable>

              {expanded
                ? items.map((cp) => (
                    <View
                      key={cp.ID}
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTopWidth: 1,
                        borderTopColor: tokens.border,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: tokens.textPrimary, flex: 1, fontSize: 15 }}>
                          {cp.Name}
                        </Text>
                        <Badge label={cp.Status} color={checkpointColor(cp.Status)} />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                        <View style={{ flex: 1 }}>
                          <PrimaryButton
                            label="OK"
                            onPress={() => setStatus(cp, 'OK')}
                            disabled={busyId === cp.ID}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <OutlineButton
                            label="NOT OK"
                            danger
                            onPress={() => setStatus(cp, 'NOT_OK')}
                          />
                        </View>
                      </View>
                      {cp.Status === 'NOT_OK' ? (
                        <View style={{ marginTop: 10 }}>
                          <OutlineButton
                            label="Report Issue"
                            danger
                            onPress={() =>
                              navigation.navigate('IssueReport', {
                                vin,
                                checkpointId: cp.ID,
                                phase: cp.PhaseNumber,
                                stationId: cp.StationID ?? undefined,
                                checkpointName: cp.Name,
                              })
                            }
                          />
                        </View>
                      ) : null}
                    </View>
                  ))
                : null}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
