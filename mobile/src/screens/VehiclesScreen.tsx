import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, type Vehicle } from '../api/client';
import { VehicleSearchPanel } from '../components/VehicleSearchPanel';
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
import type { RootStackParamList } from '../navigation/types';

type VehicleStatus =
  | 'IN_PRODUCTION'
  | 'IN_WAREHOUSE'
  | 'WITH_CUSTOMER'
  | 'SHIPPED'
  | 'ON_HOLD';

const STATUSES: { value: VehicleStatus; label: string }[] = [
  { value: 'IN_PRODUCTION', label: 'IN_PRODUCTION' },
  { value: 'IN_WAREHOUSE', label: 'IN_WAREHOUSE' },
  { value: 'WITH_CUSTOMER', label: 'WITH_CUSTOMER' },
  { value: 'SHIPPED', label: 'SHIPPED' },
  { value: 'ON_HOLD', label: 'ON_HOLD' },
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
      setError(err instanceof Error ? err.message : 'Failed to load vehicles');
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [statuses]);

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
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={load}
            tintColor={tokens.accent}
          />
        }
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            <Title>Vehicles</Title>
            <Subtitle>Tüm araçlar — istasyon kuyruğundan bağımsız</Subtitle>
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
              Araç listesi
            </Text>
          </View>
        }
        ListEmptyComponent={
          loading ? null : <Subtitle>No vehicles found</Subtitle>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => openVehicle(item)}>
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
