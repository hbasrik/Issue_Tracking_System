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

const STAT_CARDS: {
  key: HomeIssueStatKey;
  color: string;
}[] = [
  { key: 'open', color: statusColors.issueOpen },
  { key: 'in_progress', color: statusColors.issueInProgress },
  { key: 'closed_today', color: statusColors.issueDone },
  { key: 'approved_today', color: statusColors.issueResolved },
  { key: 'conditional_approved_today', color: statusColors.issueConditionalApproved },
];

/**
 * Home: Hata Bildir, vehicle search (former Ara), issue day stats (from
 * existing listIssues), and Durum overview (relocated, same Analysis queries).
 */
export default function HomeScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const { user, token } = useAuth();
  const { tokens, toggle, mode } = useTheme();
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
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <View>
            <Title>Karea</Title>
            <Subtitle>{user?.FullName ?? 'Operator'}</Subtitle>
          </View>
          <Pressable onPress={toggle} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: tokens.accent, fontSize: 13, fontWeight: '600' }}>
              {mode === 'dark' ? 'Light' : 'Dark'}
            </Text>
          </Pressable>
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
          {STAT_CARDS.map((s) => (
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
                    <ActivityIndicator color={s.color} />
                  ) : (
                    <Text style={{ color: s.color, fontSize: 22, fontWeight: '700' }}>
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
          ))}
        </View>

        <View style={{ marginTop: 8 }} key={statsKey}>
          <DurumOverview />
        </View>
      </ScrollView>
    </Screen>
  );
}
