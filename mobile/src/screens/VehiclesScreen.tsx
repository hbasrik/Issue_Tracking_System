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
import { VehicleStatusBadge } from '../components/VehicleStatusBadge';
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
import {
  VEHICLE_LIFECYCLE_FILTER_VALUES,
  deriveVehicleLifecycle,
  vehicleLifecycleLabel,
  type VehicleLifecycleFilterValue,
} from '../lib/vehicleStatus';
import type { RootStackParamList } from '../navigation/types';

function vehicleMatchesVinQuery(vehicle: Vehicle, query: string): boolean {
  const q = query.trim().toUpperCase();
  if (!q) return true;
  return vehicle.VIN.toUpperCase().includes(q);
}

function compareVinDesc(a: Vehicle, b: Vehicle): number {
  return b.VIN.localeCompare(a.VIN);
}

/**
 * Full vehicle list. Badge + filters use the same derived lifecycle values
 * as the web Vehicles page (status + EOL stage → one life-cycle key).
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
  const [lifecycles, setLifecycles] = useState<Set<VehicleLifecycleFilterValue>>(
    new Set(),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lifecycleParam =
        lifecycles.size === 1 ? [...lifecycles][0] : undefined;
      const res = await api.listVehicles({
        lifecycle: lifecycleParam,
      });
      const items = (res.Items ?? []).slice().sort(compareVinDesc);
      setVehicles(items);
    } catch (err) {
      setError(apiErrorMessage(err, t));
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [lifecycles, t]);

  // Refetch whenever this screen gains focus so depot-release / hold / deliver
  // done on the detail screen show up in the list badge immediately.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function openVehicle(v: Vehicle) {
    navigation.navigate('VehicleStation', { vin: v.VIN });
  }

  function toggleLifecycle(value: VehicleLifecycleFilterValue) {
    setLifecycles((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  const filtered = useMemo(() => {
    return vehicles
      .filter((v) => {
        if (lifecycles.size > 0) {
          const derived = deriveVehicleLifecycle(
            v.CurrentGlobalStatus,
            v.CurrentEOLStage,
          );
          if (!lifecycles.has(derived as VehicleLifecycleFilterValue)) {
            return false;
          }
        }
        if (!vehicleMatchesVinQuery(v, vinQuery)) return false;
        return true;
      })
      .sort(compareVinDesc);
  }, [vehicles, lifecycles, vinQuery]);

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
              {t('vehicles.lifecycle')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {VEHICLE_LIFECYCLE_FILTER_VALUES.map((value) => {
                const selected = lifecycles.has(value);
                return (
                  <Pressable
                    key={value}
                    onPress={() => toggleLifecycle(value)}
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
                      {vehicleLifecycleLabel(value, t)}
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
              <View style={{ marginTop: 6 }}>
                <VehicleStatusBadge
                  status={item.CurrentGlobalStatus}
                  eolStage={item.CurrentEOLStage}
                />
              </View>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
