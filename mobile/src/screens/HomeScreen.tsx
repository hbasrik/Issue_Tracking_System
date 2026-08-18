import { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, type Issue, type Vehicle } from '../api/client';
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
import type { RootStackParamList } from '../navigation/types';

function isSameLocalDay(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isClosedStatus(status: Issue['Status']): boolean {
  return (
    status === 'DONE' ||
    status === 'APPROVED' ||
    status === 'CONDITIONAL_APPROVED'
  );
}

/**
 * Home: Hata Bildir, vehicle search (former Ara), issue day stats (from
 * existing listIssues), and Durum overview (relocated, same Analysis queries).
 */
export default function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { tokens, toggle, mode } = useTheme();
  const [openToday, setOpenToday] = useState(0);
  const [closedToday, setClosedToday] = useState(0);
  const [inProgress, setInProgress] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [statsKey, setStatsKey] = useState(0);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.listIssues();
      const items = res.items ?? [];
      const now = new Date();
      let open = 0;
      let closed = 0;
      let progress = 0;
      for (const issue of items) {
        if (issue.Status === 'OPEN') {
          open += 1;
        } else if (issue.Status === 'IN_PROGRESS') {
          progress += 1;
        } else if (
          isClosedStatus(issue.Status) &&
          isSameLocalDay(issue.UpdatedAt, now)
        ) {
          closed += 1;
        }
      }
      setOpenToday(open);
      setClosedToday(closed);
      setInProgress(progress);
    } catch {
      // Stats are informational; DurumOverview surfaces its own errors.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadStats();
    }, [loadStats]),
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

  const statCards: { label: string; value: number; color: string }[] = [
    { label: 'Açık (bugün)', value: openToday, color: statusColors.issueOpen },
    {
      label: 'Kapanan (bugün)',
      value: closedToday,
      color: statusColors.issueResolved,
    },
    {
      label: 'Devam eden',
      value: inProgress,
      color: statusColors.issueInProgress,
    },
  ];

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
            gap: 8,
            marginTop: 20,
          }}
        >
          {statCards.map((s) => (
            <View key={s.label} style={{ flex: 1 }}>
              <Card>
                <View style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={{ color: s.color, fontSize: 22, fontWeight: '700' }}>
                    {s.value}
                  </Text>
                  <Text
                    style={{
                      color: tokens.textSecondary,
                      fontSize: 11,
                      textAlign: 'center',
                      marginTop: 4,
                    }}
                  >
                    {s.label}
                  </Text>
                </View>
              </Card>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 8 }} key={statsKey}>
          <DurumOverview />
        </View>
      </ScrollView>
    </Screen>
  );
}
