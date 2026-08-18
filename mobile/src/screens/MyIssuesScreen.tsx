import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, type Issue, type Vehicle } from '../api/client';
import { VehicleSearchPanel } from '../components/VehicleSearchPanel';
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
import {
  SeverityIndicator,
  severityFillColor,
  type SeverityLevel,
} from '../components/SeverityIndicator';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type IssueStatus = Issue['Status'];

const SEVERITIES: SeverityLevel[] = ['CRITICAL', 'MEDIUM', 'LOW'];

const STATUSES: { value: IssueStatus; label: string }[] = [
  { value: 'OPEN', label: 'Açık' },
  { value: 'IN_PROGRESS', label: 'İşlemde' },
  { value: 'DONE', label: 'Tamamlandı' },
  { value: 'CONDITIONAL_APPROVED', label: 'Şartlı Onay' },
  { value: 'APPROVED', label: 'Kalite Onay' },
];

function statusColor(s: string): string {
  if (s === 'OPEN') return statusColors.issueOpen;
  if (s === 'IN_PROGRESS') return statusColors.issueInProgress;
  return statusColors.issueResolved;
}

function statusLabel(s: IssueStatus): string {
  return STATUSES.find((x) => x.value === s)?.label ?? s;
}

export default function MyIssuesScreen() {
  const { tokens } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [severities, setSeverities] = useState<Set<SeverityLevel>>(new Set());
  const [statuses, setStatuses] = useState<Set<IssueStatus>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listIssues();
      setItems(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function toggleSeverity(s: SeverityLevel) {
    setSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleStatus(s: IssueStatus) {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const filtered = useMemo(() => {
    return items.filter((issue) => {
      if (vehicle && issue.VIN !== vehicle.VIN) return false;
      if (severities.size > 0 && !severities.has(issue.Severity)) return false;
      if (statuses.size > 0 && !statuses.has(issue.Status)) return false;
      return true;
    });
  }, [items, vehicle, severities, statuses]);

  return (
    <Screen padded={false}>
      <FlatList
        data={filtered}
        keyExtractor={(i) => String(i.ID)}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            <Title>My Issues</Title>
            <Subtitle>Reported or in progress by you</Subtitle>

            <Text
              style={{
                color: tokens.textSecondary,
                fontWeight: '600',
                fontSize: 13,
                marginTop: 16,
              }}
            >
              Araç
            </Text>
            <VehicleSearchPanel onSelect={setVehicle} />
            {vehicle ? (
              <View
                style={{
                  marginTop: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <Text style={{ color: tokens.textPrimary, flex: 1, fontSize: 13 }}>
                  Filtre: {vehicle.VehicleNumber ? `#${vehicle.VehicleNumber} · ` : ''}
                  {vehicle.VIN}
                </Text>
                <OutlineButton label="Temizle" onPress={() => setVehicle(null)} />
              </View>
            ) : null}

            <Text
              style={{
                color: tokens.textSecondary,
                fontWeight: '600',
                fontSize: 13,
                marginTop: 16,
                marginBottom: 8,
              }}
            >
              Severity
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {SEVERITIES.map((s) => {
                const selected = severities.has(s);
                const color = severityFillColor(s);
                return (
                  <Pressable
                    key={s}
                    onPress={() => toggleSeverity(s)}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: selected ? color : tokens.border,
                      backgroundColor: selected ? color + '33' : tokens.bgSurface1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      paddingVertical: 6,
                    }}
                  >
                    <SeverityIndicator severity={s} />
                    <Text
                      style={{
                        color: selected ? color : tokens.textSecondary,
                        fontWeight: '600',
                        fontSize: 10,
                      }}
                    >
                      {s}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text
              style={{
                color: tokens.textSecondary,
                fontWeight: '600',
                fontSize: 13,
                marginTop: 16,
                marginBottom: 8,
              }}
            >
              Durum
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {STATUSES.map((s) => {
                const selected = statuses.has(s.value);
                return (
                  <Pressable
                    key={s.value}
                    onPress={() => toggleStatus(s.value)}
                    style={{
                      paddingHorizontal: 12,
                      minHeight: 36,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: selected ? tokens.accent : tokens.border,
                      backgroundColor: selected
                        ? tokens.bgSurface2
                        : tokens.bgSurface1,
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? tokens.accent : tokens.textSecondary,
                        fontSize: 12,
                        fontWeight: '600',
                      }}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {error ? <ErrorText>{error}</ErrorText> : null}
            {loading ? <Loading /> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? null : <Subtitle>No issues match filters</Subtitle>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('IssueDetail', { id: item.ID })}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Badge label={statusLabel(item.Status)} color={statusColor(item.Status)} />
                <SeverityIndicator severity={item.Severity} />
              </View>
              <Text style={{ color: tokens.textPrimary, fontWeight: '600' }}>
                …{item.VIN.slice(-5)}
              </Text>
              <Text
                style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 13 }}
                numberOfLines={2}
              >
                {item.Description}
              </Text>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
