import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CompositeNavigationProp,
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, type Issue, type Vehicle } from '../api/client';
import { VehicleSearchPanel } from '../components/VehicleSearchPanel';
import { IssueCard } from '../components/IssueCard';
import {
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
import {
  HOME_ISSUE_STAT_LABELS,
  matchesHomeIssueStat,
  type HomeIssueStatKey,
} from '../lib/homeIssueStats';
import { issueMatchesListQuery } from '../lib/issueVinFilter';
import type { MainDrawerParamList, RootStackParamList } from '../navigation/types';

type IssueStatus = Issue['Status'];

type MyIssuesNavigation = CompositeNavigationProp<
  DrawerNavigationProp<MainDrawerParamList, 'MyIssues'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const SEVERITIES: SeverityLevel[] = ['CRITICAL', 'MEDIUM', 'LOW'];

const STATUSES: { value: IssueStatus; label: string }[] = [
  { value: 'OPEN', label: 'Açık' },
  { value: 'IN_PROGRESS', label: 'İşlemde' },
  { value: 'DONE', label: 'Tamamlandı' },
  { value: 'CONDITIONAL_APPROVED', label: 'Şartlı Onay' },
  { value: 'APPROVED', label: 'Kalite Onay' },
];

function issueCreatedMs(issue: Issue): number {
  return Date.parse(issue.CreatedAt || issue.IssueDate || '') || 0;
}

export default function MyIssuesScreen() {
  const { tokens } = useTheme();
  const navigation = useNavigation<MyIssuesNavigation>();
  const route = useRoute<RouteProp<MainDrawerParamList, 'MyIssues'>>();
  const [items, setItems] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [listQuery, setListQuery] = useState('');
  const [severities, setSeverities] = useState<Set<SeverityLevel>>(new Set());
  const [statuses, setStatuses] = useState<Set<IssueStatus>>(new Set());
  const [homeStat, setHomeStat] = useState<HomeIssueStatKey | undefined>(
    route.params?.homeStat,
  );
  /** Frozen at preset apply so list length matches the Home card at tap time. */
  const [homeStatNow, setHomeStatNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listIssues();
      const list = (res.items ?? []).slice().sort((a, b) => {
        const ta = issueCreatedMs(a);
        const tb = issueCreatedMs(b);
        if (tb !== ta) return tb - ta;
        return b.ID - a.ID;
      });
      setItems(list);
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

  // Apply (or clear) the Home deep-link whenever the route param changes.
  useEffect(() => {
    const next = route.params?.homeStat;
    setHomeStat(next);
    if (next) {
      setHomeStatNow(new Date());
      setStatuses(new Set());
      setSeverities(new Set());
      setVehicle(null);
      setListQuery('');
    }
  }, [route.params?.homeStat]);

  function clearHomeStat() {
    setHomeStat(undefined);
    navigation.setParams({ homeStat: undefined });
  }

  function toggleSeverity(s: SeverityLevel) {
    if (homeStat) clearHomeStat();
    setSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleStatus(s: IssueStatus) {
    if (homeStat) clearHomeStat();
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const filtered = useMemo(() => {
    return items.filter((issue) => {
      if (homeStat) {
        return matchesHomeIssueStat(issue, homeStat, homeStatNow);
      }
      if (vehicle && issue.VIN !== vehicle.VIN) return false;
      if (!issueMatchesListQuery(issue, listQuery)) return false;
      if (severities.size > 0 && !severities.has(issue.Severity)) return false;
      if (statuses.size > 0 && !statuses.has(issue.Status)) return false;
      return true;
    });
  }, [items, vehicle, listQuery, severities, statuses, homeStat, homeStatNow]);

  return (
    <Screen padded={false}>
      <FlatList
        data={filtered}
        keyExtractor={(i) => String(i.ID)}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            <Title>Hatalar</Title>
            <Subtitle>Tüm hatalar — VIN veya bildiren adıyla süz</Subtitle>

            {homeStat ? (
              <View
                style={{
                  marginTop: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <Text style={{ color: tokens.textPrimary, flex: 1, fontSize: 13 }}>
                  Home filtre: {HOME_ISSUE_STAT_LABELS[homeStat]} · {filtered.length} kayıt
                </Text>
                <OutlineButton label="Temizle" onPress={clearHomeStat} />
              </View>
            ) : null}

            <Text
              style={{
                color: tokens.textSecondary,
                fontWeight: '600',
                fontSize: 13,
                marginTop: 16,
              }}
            >
              VIN / bildiren
            </Text>
            <TextInput
              value={listQuery}
              onChangeText={(q) => {
                if (homeStat) clearHomeStat();
                setListQuery(q);
              }}
              placeholder="VIN veya bildiren adı"
              placeholderTextColor={tokens.textSecondary}
              autoCorrect={false}
              autoCapitalize="none"
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                minHeight: 44,
                backgroundColor: tokens.bgSurface1,
                borderColor: tokens.border,
                color: tokens.textPrimary,
              }}
            />

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
            <VehicleSearchPanel
              onSelect={(v) => {
                if (homeStat) clearHomeStat();
                setVehicle(v);
              }}
              onQueryChange={() => {
                if (homeStat) clearHomeStat();
                setVehicle(null);
              }}
            />
            {vehicle && !homeStat ? (
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
                  Filtre: {vehicle.VIN}
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
                const selected = !homeStat && severities.has(s);
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
                const selected = !homeStat && statuses.has(s.value);
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
          <IssueCard
            issue={item}
            onPress={() => navigation.navigate('IssueDetail', { id: item.ID })}
          />
        )}
      />
    </Screen>
  );
}
