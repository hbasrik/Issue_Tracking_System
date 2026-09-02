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
  EOL_STAGE_FILTER_VALUES,
  VEHICLE_STATUS_FILTER_VALUES,
  eolStageLabel,
  vehicleStatusLabel,
  type EolStageFilterValue,
  type VehicleStatusFilterValue,
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
  const [statuses, setStatuses] = useState<Set<VehicleStatusFilterValue>>(new Set());
  const [eolStages, setEolStages] = useState<Set<EolStageFilterValue>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statusParam = statuses.size === 1 ? [...statuses][0] : undefined;
      const eolStageParam = eolStages.size === 1 ? [...eolStages][0] : undefined;
      const res = await api.listVehicles({
        status: statusParam,
        eol_stage: eolStageParam,
      });
      const items = (res.Items ?? []).slice().sort(compareVinDesc);
      setVehicles(items);
    } catch (err) {
      setError(apiErrorMessage(err, t));
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [statuses, eolStages, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function openVehicle(v: Vehicle) {
    navigation.navigate('VehicleStation', { vin: v.VIN });
  }

  function toggleStatus(s: VehicleStatusFilterValue) {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleEolStage(s: EolStageFilterValue) {
    setEolStages((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const filtered = useMemo(() => {
    return vehicles
      .filter((v) => {
        if (
          statuses.size > 0 &&
          !statuses.has(v.CurrentGlobalStatus as VehicleStatusFilterValue)
        ) {
          return false;
        }
        if (eolStages.size > 0) {
          const stage = v.CurrentEOLStage;
          if (!stage) return false;
          const normalized =
            stage === 'DOCUMENT' ? 'DEPOT' : (stage as EolStageFilterValue);
          if (!eolStages.has(normalized)) return false;
        }
        if (!vehicleMatchesVinQuery(v, vinQuery)) return false;
        return true;
      })
      .sort(compareVinDesc);
  }, [vehicles, statuses, eolStages, vinQuery]);

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
              {VEHICLE_STATUS_FILTER_VALUES.map((value) => {
                const selected = statuses.has(value);
                return (
                  <Pressable
                    key={value}
                    onPress={() => toggleStatus(value)}
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
                      {vehicleStatusLabel(value, t)}
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
              {t('print.eolStage')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {EOL_STAGE_FILTER_VALUES.map((value) => {
                const selected = eolStages.has(value);
                return (
                  <Pressable
                    key={value}
                    onPress={() => toggleEolStage(value)}
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
                      {eolStageLabel(value, t)}
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
