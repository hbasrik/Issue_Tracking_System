import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  api,
  type StationDefectRate,
  type VehicleSeverityBreakdown,
} from '../api/client';
import {
  Badge,
  Card,
  ErrorText,
  Loading,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

/**
 * Read-only current-state problem overview (Decision Log #9).
 * Uses shared Analysis views with no filters / date range / export.
 */
export default function DurumScreen() {
  const { tokens } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [vehicles, setVehicles] = useState<VehicleSeverityBreakdown[]>([]);
  const [stations, setStations] = useState<StationDefectRate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sev, def] = await Promise.all([
        api.vehicleSeverityBreakdown(),
        api.defectRatePerStation(),
      ]);
      const rows = (sev.items ?? []).filter((r) => r.TotalOpenIssues > 0);
      rows.sort((a, b) => b.TotalOpenIssues - a.TotalOpenIssues);
      setVehicles(rows);
      setStations(def.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading && !vehicles.length && !stations.length) {
    return (
      <Screen>
        <Title>Durum</Title>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.VIN}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={tokens.accent} />
        }
        ListHeaderComponent={
          <View>
            <Title>Durum</Title>
            <Subtitle>Açık hatalar — anlık görünüm</Subtitle>
            {error ? <ErrorText>{error}</ErrorText> : null}

            <Text
              style={{
                color: tokens.textSecondary,
                fontWeight: '600',
                fontSize: 13,
                marginTop: 20,
                marginBottom: 4,
              }}
            >
              İstasyon özeti
            </Text>
            {stations.length === 0 ? (
              <Subtitle>No station defect rows</Subtitle>
            ) : (
              stations.map((s) => (
                <Card key={s.StationID}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: tokens.textPrimary, flex: 1, fontSize: 15 }}>
                      {s.StationName}
                    </Text>
                    <Badge label={`${s.IssueCount} issues`} color={statusColors.notOk} />
                  </View>
                  <Text style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 12 }}>
                    {s.VehiclesWithIssue} vehicles with issues
                  </Text>
                </Card>
              ))
            )}

            <Text
              style={{
                color: tokens.textSecondary,
                fontWeight: '600',
                fontSize: 13,
                marginTop: 20,
                marginBottom: 4,
              }}
            >
              Araçlar (açık hatalar)
            </Text>
            {vehicles.length === 0 ? (
              <Subtitle>No vehicles with open issues</Subtitle>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('VehiclePhase', { vin: item.VIN })}
          >
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: tokens.textPrimary, fontWeight: '700', fontSize: 18 }}>
                  …{item.VIN.slice(-5)}
                </Text>
                <Badge
                  label={`${item.TotalOpenIssues} open`}
                  color={statusColors.issueOpen}
                />
              </View>
              <Text style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 12 }}>
                {item.VIN}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Badge label={`C ${item.CriticalCount}`} color={statusColors.severityCritical} />
                <Badge label={`M ${item.MediumCount}`} color={statusColors.severityMedium} />
                <Badge label={`L ${item.LowCount}`} color={statusColors.severityLow} />
              </View>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
