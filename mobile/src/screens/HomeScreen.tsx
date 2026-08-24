import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  CompositeNavigationProp,
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, type Vehicle } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { DurumOverview } from '../components/DurumOverview';
import { VehicleSearchPanel } from '../components/VehicleSearchPanel';
import {
  Card,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';
import {
  countHomeIssueStat,
  HOME_ISSUE_STAT_LABELS,
  type HomeIssueStatKey,
} from '../lib/homeIssueStats';
import type { MainDrawerParamList, RootStackParamList } from '../navigation/types';

type HomeNavigation = CompositeNavigationProp<
  DrawerNavigationProp<MainDrawerParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const STAT_KEYS: { key: HomeIssueStatKey }[] = [
  { key: 'open' },
  { key: 'in_progress' },
  { key: 'closed_today' },
  { key: 'approved_today' },
  { key: 'conditional_approved_today' },
];

function statCardColor(key: HomeIssueStatKey): string {
  switch (key) {
    case 'open':
      return statusColors.issueOpen;
    case 'in_progress':
      return statusColors.issueInProgress;
    case 'closed_today':
      return statusColors.issueDone;
    case 'approved_today':
      return statusColors.issueResolved;
    case 'conditional_approved_today':
      return statusColors.issueConditionalApproved;
  }
}

/**
 * Home: Hata Bildir, vehicle search (former Ara), issue day stats (from
 * existing listIssues), and Durum overview (relocated, same Analysis queries).
 */
export default function HomeScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const { user, token } = useAuth();
  const { tokens } = useTheme();
  const [counts, setCounts] = useState<Record<HomeIssueStatKey, number>>({
    open: 0,
    in_progress: 0,
    closed_today: 0,
    approved_today: 0,
    conditional_approved_today: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statsKey, setStatsKey] = useState(0);

  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.listIssues();
      const items = res.items ?? [];
      const now = new Date();
      const next = {
        open: countHomeIssueStat(items, 'open', now),
        in_progress: countHomeIssueStat(items, 'in_progress', now),
        closed_today: countHomeIssueStat(items, 'closed_today', now),
        approved_today: countHomeIssueStat(items, 'approved_today', now),
        conditional_approved_today: countHomeIssueStat(
          items,
          'conditional_approved_today',
          now,
        ),
      };
      setCounts(next);
      setStatsLoading(false);
      if (__DEV__) {
        console.info('[karea] home stats loaded', next);
      }
    } catch (err) {
      if (__DEV__) {
        console.warn('[karea] home stats failed', err);
      }
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      void loadStats();
    }, [loadStats, token]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await loadStats();
    setStatsKey((k) => k + 1);
    setRefreshing(false);
  }

  function openVehicle(v: Vehicle) {
    navigation.navigate('VehicleStation', { vin: v.VIN });
  }

  function openStat(key: HomeIssueStatKey) {
    navigation.navigate('MyIssues', { homeStat: key });
  }

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={tokens.accent}
          />
        }
      >
        <View>
          <Title>Karea</Title>
          <Subtitle>{user?.FullName ?? 'Operator'}</Subtitle>
        </View>

        <View style={{ marginTop: 20 }}>
          <PrimaryButton
            label="Hata Bildir"
            onPress={() => navigation.navigate('ManualIssueReport')}
          />
          <Subtitle>
            Bağımsız hata / tamir bildirimi — istasyon adımına bağlı değil
          </Subtitle>
        </View>

        <View style={{ marginTop: 20 }}>
          <Text
            style={{
              color: tokens.textSecondary,
              fontWeight: '600',
              fontSize: 13,
              marginBottom: 4,
            }}
          >
            Araç ara
          </Text>
          <VehicleSearchPanel onSelect={openVehicle} />
        </View>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginTop: 20,
          }}
        >
          {STAT_KEYS.map((s) => {
            const color = statCardColor(s.key);
            return (
              <Pressable
                key={s.key}
                onPress={() => openStat(s.key)}
                style={{ width: '31%', flexGrow: 1, minWidth: 100 }}
                accessibilityRole="button"
                accessibilityLabel={`${HOME_ISSUE_STAT_LABELS[s.key]}: ${counts[s.key]}`}
              >
                <Card>
                  <View style={{ alignItems: 'center', paddingVertical: 4 }}>
                    {statsLoading ? (
                      <ActivityIndicator color={color} />
                    ) : (
                      <Text style={{ color, fontSize: 22, fontWeight: '700' }}>
                        {counts[s.key]}
                      </Text>
                    )}
                    <Text
                      style={{
                        color: tokens.textSecondary,
                        fontSize: 11,
                        textAlign: 'center',
                        marginTop: 4,
                      }}
                    >
                      {HOME_ISSUE_STAT_LABELS[s.key]}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 8 }} key={statsKey}>
          <DurumOverview />
        </View>
      </ScrollView>
    </Screen>
  );
}
