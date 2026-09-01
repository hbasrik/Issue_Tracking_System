import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  api,
  type StationDefectRate,
  type VehicleSeverityBreakdown,
} from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Badge, Card, ErrorText, Loading, Subtitle } from './ui';
import { SeverityIndicator } from './SeverityIndicator';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n';
import { apiErrorMessage } from '../lib/password';
import { statusColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

/**
 * Former Durum tab content — read-only problem overview (Decision Log #9).
 * Same Analysis queries; relocated onto Home (not a standalone destination).
 */
export function DurumOverview() {
  const { tokens } = useTheme();
  const { t } = useI18n();
  const { token } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [vehicles, setVehicles] = useState<VehicleSeverityBreakdown[]>([]);
  const [stations, setStations] = useState<StationDefectRate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
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
      setError(apiErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      void load();
    }, [load, token]),
  );

  if (loading && !vehicles.length && !stations.length) {
    return <Loading />;
  }

  return (
    <View>
      <Text
        style={{
          color: tokens.textPrimary,
          fontWeight: '700',
          fontSize: 18,
          marginTop: 8,
        }}
      >
        {t('home.snapshot')}
      </Text>
      <Subtitle>{t('home.durumTitle')}</Subtitle>
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Text
        style={{
          color: tokens.textSecondary,
          fontWeight: '600',
          fontSize: 13,
          marginTop: 16,
          marginBottom: 4,
        }}
      >
        {t('home.stationSummary')}
      </Text>
      {stations.length === 0 ? (
        <Subtitle>{t('home.noStationDefects')}</Subtitle>
      ) : (
        stations.map((s) => (
          <Card key={s.StationID}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: tokens.textPrimary, flex: 1, fontSize: 15 }}>
                {s.StationName}
              </Text>
              <Badge label={t('home.issuesCount', { n: s.IssueCount })} color={statusColors.notOk} />
            </View>
            <Text style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 12 }}>
              {t('home.vehiclesWithIssues', { n: s.VehiclesWithIssue })}
            </Text>
          </Card>
        ))
      )}

      <Text
        style={{
          color: tokens.textSecondary,
          fontWeight: '600',
          fontSize: 13,
          marginTop: 16,
          marginBottom: 4,
        }}
      >
        {t('home.vehiclesOpen')}
      </Text>
      {vehicles.length === 0 ? (
        <Subtitle>{t('home.noOpenVehicles')}</Subtitle>
      ) : (
        vehicles.map((item) => (
          <Pressable
            key={item.VIN}
            onPress={() => navigation.navigate('VehicleStation', { vin: item.VIN })}
          >
            <Card>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: tokens.textPrimary, fontWeight: '700', fontSize: 18 }}>
                  …{item.VIN.slice(-5)}
                </Text>
                <Badge
                  label={t('home.openCount', { n: item.TotalOpenIssues })}
                  color={statusColors.issueOpen}
                />
              </View>
              <Text style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 12 }}>
                {item.VIN}
              </Text>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}
              >
                <SeverityIndicator severity="CRITICAL" count={item.CriticalCount} />
                <SeverityIndicator severity="MEDIUM" count={item.MediumCount} />
                <SeverityIndicator severity="LOW" count={item.LowCount} />
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </View>
  );
}
