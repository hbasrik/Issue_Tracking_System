import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, type Vehicle } from '../api/client';
import { VehicleSearchPanel } from '../components/VehicleSearchPanel';
import { listKeyboardDismissProps } from '../components/keyboard';
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
import { useI18n } from '../i18n';
import { apiErrorMessage } from '../lib/password';
import type { RootStackParamList } from '../navigation/types';
import type { MessageKey } from '../../../shared/i18n';

type VehicleStatus =
  | 'IN_PRODUCTION'
  | 'IN_WAREHOUSE'
  | 'DELIVERED'
  | 'SHIPPED'
  | 'ON_HOLD';

const STATUSES: { value: VehicleStatus; key: MessageKey }[] = [
  { value: 'IN_PRODUCTION', key: 'status.vehicle.inProduction' },
  { value: 'IN_WAREHOUSE', key: 'status.vehicle.inWarehouse' },
  { value: 'DELIVERED', key: 'status.vehicle.delivered' },
  { value: 'SHIPPED', key: 'status.vehicle.shipped' },
  { value: 'ON_HOLD', key: 'status.vehicle.onHold' },
];

function vehicleMatchesVinQuery(vehicle: Vehicle, query: string): boolean {
  const q = query.trim().toUpperCase();
  if (!q) return true;
  return vehicle.VIN.toUpperCase().includes(q);
}

function compareVinDesc(a: Vehicle, b: Vehicle): number {
  return b.VIN.localeCompare(a.VIN);
}

/**
 * Full vehicle list (replaces İstasyon queue). Same listVehicles API the
 * station screen used, without a station filter — tap opens VehicleStation.
 */
export default function VehiclesScreen() {
  const { tokens } = useTheme();
  const { t } = useI18n();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [vinQuery, setVinQuery] = useState('');
  const [statuses, setStatuses] = useState<Set<VehicleStatus>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statusParam = statuses.size === 1 ? [...statuses][0] : undefined;
      const res = await api.listVehicles({ status: statusParam });
      const items = (res.Items ?? []).slice().sort(compareVinDesc);
      setVehicles(items);
    } catch (err) {
      setError(apiErrorMessage(err, t));
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [statuses, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function openVehicle(v: Vehicle) {
    navigation.navigate('VehicleStation', { vin: v.VIN });
  }

  function toggleStatus(s: VehicleStatus) {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const filtered = useMemo(() => {
    return vehicles
      .filter((v) => {
        if (statuses.size > 0 && !statuses.has(v.CurrentGlobalStatus as VehicleStatus)) {
          return false;
        }
        if (!vehicleMatchesVinQuery(v, vinQuery)) return false;
        return true;
      })
      .sort(compareVinDesc);
  }, [vehicles, statuses, vinQuery]);

  return (
    <Screen padded={false}>
      <FlatList
        data={filtered}
        keyExtractor={(v) => v.VIN}
        {...listKeyboardDismissProps}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={load}
            tintColor={tokens.accent}
          />
        }
        ListHeaderComponent={
          <Pressable onPress={Keyboard.dismiss} accessible={false} style={{ marginBottom: 12 }}>
            <Title>{t('vehicles.title')}</Title>
            <Subtitle>{t('vehicles.listSubtitle')}</Subtitle>
            <View style={{ marginTop: 12 }}>
              <VehicleSearchPanel
                onSelect={openVehicle}
                onQueryChange={setVinQuery}
              />
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
              {t('issue.status')}
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
                      {t(s.key)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {error ? <ErrorText>{error}</ErrorText> : null}
            {loading && vehicles.length === 0 ? <Loading /> : null}
            <Text
              style={{
                color: tokens.textSecondary,
                fontWeight: '600',
                fontSize: 13,
                marginTop: 20,
                marginBottom: 4,
              }}
            >
              {t('vehicles.listTitle')}
            </Text>
          </Pressable>
        }
        ListEmptyComponent={
          loading ? null : <Subtitle>{t('vehicles.none')}</Subtitle>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              openVehicle(item);
            }}
          >
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text
                  style={{ color: tokens.textPrimary, fontWeight: '700', fontSize: 18 }}
                >
                  …{item.VIN.slice(-5)}
                </Text>
                <Badge
                  label={`${Math.round(item.TotalProgressPercentage)}%`}
                  color={tokens.accent}
                />
              </View>
              <Text style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 13 }}>
                {item.VIN}
              </Text>
              <Text style={{ color: tokens.textSecondary, marginTop: 2, fontSize: 12 }}>
                {item.CurrentGlobalStatus}
              </Text>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
