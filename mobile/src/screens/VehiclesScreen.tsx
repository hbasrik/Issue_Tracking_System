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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listVehicles({});
      const items = (res.Items ?? []).slice().sort((a, b) => {
        const ta = a.UpdatedAt ? Date.parse(a.UpdatedAt) : 0;
        const tb = b.UpdatedAt ? Date.parse(b.UpdatedAt) : 0;
        if (tb !== ta) return tb - ta;
        return b.TotalProgressPercentage - a.TotalProgressPercentage;
      });
      setVehicles(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicles');
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function openVehicle(v: Vehicle) {
    navigation.navigate('VehicleStation', { vin: v.VIN });
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={vehicles}
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
              <VehicleSearchPanel onSelect={openVehicle} />
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
                {item.VehicleNumber ? `#${item.VehicleNumber} · ` : ''}
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
