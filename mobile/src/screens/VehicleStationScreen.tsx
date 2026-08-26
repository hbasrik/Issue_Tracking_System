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
  type Issue,
  type ShipmentReadiness,
  type StationStepItem,
  type Vehicle,
} from '../api/client';
import { ProgressRing } from '../components/ProgressRing';
import { IssueCard } from '../components/IssueCard';
import {
  Badge,
  Card,
  ErrorText,
  Loading,
  OutlineButton,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { statusColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface StationGroup {
  id: number;
  name: string;
  steps: StationStepItem[];
}

function stepColor(status: StationStepItem['Status']): string {
  if (status === 'OK') return statusColors.ok;
  if (status === 'NOT_OK') return statusColors.notOk;
  return statusColors.pending;
}

function vinTail(vin: string): string {
  return vin.slice(-5);
}

/** Outline by default; fills only when this choice matches the step status. */
function StatusChoiceButton({
  label,
  selected,
  color,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ selected, disabled: !!disabled }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        borderRadius: 10,
        borderWidth: selected ? 0 : 1.5,
        borderColor: color,
        backgroundColor: selected ? color : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          color: selected ? '#FFFFFF' : color,
          fontWeight: '700',
          fontSize: 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function VehicleStationScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'VehicleStation'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tokens } = useTheme();
  const { has } = useAuth();
  const vin = route.params.vin;

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [steps, setSteps] = useState<StationStepItem[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [readiness, setReadiness] = useState<ShipmentReadiness | null>(null);
  const [openByStation, setOpenByStation] = useState<Record<string, number>>({});
  const [expandedStation, setExpandedStation] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [v, res, issueRes, ready] = await Promise.all([
        api.getVehicle(vin),
        api.getStationSteps(vin),
        has(Perm.IssueView)
          ? api.listIssues(undefined, vin).catch(() => ({ items: [] as Issue[] }))
          : Promise.resolve({ items: [] as Issue[] }),
        has(Perm.ChecklistShipmentView)
          ? api.shipmentReadiness(vin).catch(() => null)
          : Promise.resolve(null),
      ]);
      setVehicle(v);
      setSteps(res.Items ?? []);
      setOpenByStation(res.OpenIssuesByStation ?? {});
      setIssues(issueRes.items ?? []);
      setReadiness(ready);
      setExpandedStation((prev) => prev ?? v.CurrentStationID);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicle');
    }
  }, [vin, has]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Karar 1: the station catalogue is extensible, so the screen renders the
  // stations the backend returned rather than a fixed 1..8 range.
  const stations = useMemo<StationGroup[]>(() => {
    const groups: StationGroup[] = [];
    const byId = new Map<number, StationGroup>();
    for (const step of steps) {
      let group = byId.get(step.StationID);
      if (!group) {
        group = { id: step.StationID, name: step.StationName, steps: [] };
        byId.set(step.StationID, group);
        groups.push(group);
      }
      group.steps.push(step);
    }
    for (const group of groups) {
      group.steps.sort((a, b) => a.SequenceNo - b.SequenceNo);
    }
    return groups;
  }, [steps]);

  const currentStationName = useMemo(() => {
    const current = stations.find((s) => s.id === vehicle?.CurrentStationID);
    return current?.name ?? '—';
  }, [stations, vehicle]);

  async function setStatus(step: StationStepItem, status: 'OK' | 'NOT_OK') {
    setBusyId(step.ID);
    setError(null);
    try {
      await api.recordStationStep(vin, step.ID, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update station step');
    } finally {
      setBusyId(null);
    }
  }

  function toggleStation(stationId: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedStation((cur) => (cur === stationId ? null : stationId));
  }

  if (!vehicle && !error) return <Loading />;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Title>İstasyon İlerleme</Title>
        <Subtitle>
          {vin}
        </Subtitle>

        <View style={{ alignItems: 'center', marginVertical: 20 }}>
          <ProgressRing percent={vehicle?.TotalProgressPercentage ?? 0} />
          <Text style={{ color: tokens.textSecondary, marginTop: 8, fontSize: 13 }}>
            …{vinTail(vin)}
            {currentStationName !== '—' ? ` · ${currentStationName}` : ''}
          </Text>
        </View>

        <View style={{ gap: 8, marginBottom: 16 }}>
          {readiness && !readiness.ready && readiness.warnings.length > 0 ? (
            <Card>
              <Text style={{ color: statusColors.conditionalOk, fontWeight: '600', fontSize: 15 }}>
                Sevk öncesi uyarı
              </Text>
              {readiness.warnings.map((w, i) => (
                <Text
                  key={`${w.code}-${i}`}
                  style={{ color: tokens.textPrimary, fontSize: 13, marginTop: 6 }}
                >
                  • {w.message}
                </Text>
              ))}
            </Card>
          ) : null}
          {has(Perm.ChecklistShipmentView) ? (
            <OutlineButton
              label="Shipment Checklist"
              onPress={() => navigation.navigate('ShipmentChecklist', { vin })}
            />
          ) : null}
          {has(Perm.ChecklistTestView) ? (
            <OutlineButton
              label="Test Checklist"
              onPress={() => navigation.navigate('TestChecklist', { vin })}
            />
          ) : null}
          {has(Perm.ChecklistEOLView) ? (
            <OutlineButton
              label="EoL Checklist"
              onPress={() => navigation.navigate('EOLChecklist', { vin })}
            />
          ) : null}
        </View>

        {error ? <ErrorText>{error}</ErrorText> : null}

        {has(Perm.IssueView) ? (
        <View style={{ marginBottom: 16 }}>
          <Text
            style={{
              color: tokens.textPrimary,
              fontSize: 17,
              fontWeight: '600',
              marginBottom: 4,
            }}
          >
            Issues
          </Text>
          <Subtitle>Bu araca ait tüm issue’lar — karta dokunarak detayı açın</Subtitle>
          {issues.length === 0 ? (
            <Subtitle>Bu araç için issue yok</Subtitle>
          ) : (
            issues.map((issue) => (
              <IssueCard
                key={issue.ID}
                issue={issue}
                hideVin
                onPress={() => navigation.navigate('IssueDetail', { id: issue.ID })}
              />
            ))
          )}
        </View>
        ) : null}

        {stations.map((station) => {
          const openCount = openByStation[String(station.id)] ?? 0;
          const active = station.id === vehicle?.CurrentStationID;
          const done =
            station.steps.length > 0 && station.steps.every((s) => s.Status === 'OK');
          const expanded = expandedStation === station.id;

          return (
            <Card key={station.id}>
              <Pressable
                onPress={() => toggleStation(station.id)}
                style={{ minHeight: 44 }}
              >
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
                    {station.name}
                  </Text>
                  {/* Soft-warning: open issue badge — informational only, never blocks */}
                  {openCount > 0 ? (
                    <Badge label={`${openCount} open`} color={statusColors.notOk} />
                  ) : null}
                </View>
              </Pressable>

              {expanded
                ? station.steps.map((step) => (
                    <View
                      key={step.ID}
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTopWidth: 1,
                        borderTopColor: tokens.border,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: tokens.textPrimary, flex: 1, fontSize: 15 }}>
                          {step.Name}
                        </Text>
                        <Badge label={step.Status} color={stepColor(step.Status)} />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                        <StatusChoiceButton
                          label="OK"
                          selected={step.Status === 'OK'}
                          color={statusColors.ok}
                          onPress={() => void setStatus(step, 'OK')}
                          disabled={busyId === step.ID || !has(Perm.StationStepEdit)}
                        />
                        <StatusChoiceButton
                          label="NOT OK"
                          selected={step.Status === 'NOT_OK'}
                          color={statusColors.notOk}
                          onPress={() => void setStatus(step, 'NOT_OK')}
                          disabled={busyId === step.ID || !has(Perm.StationStepEdit)}
                        />
                      </View>
                      {step.Status === 'NOT_OK' && has(Perm.IssueCreate) ? (
                        <View style={{ marginTop: 10 }}>
                          <OutlineButton
                            label="Issue Bildir"
                            danger
                            onPress={() =>
                              navigation.navigate('IssueReport', {
                                vin,
                                stationStepId: step.ID,
                                stationId: step.StationID,
                                stationName: step.StationName,
                                stationStepName: step.Name,
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
