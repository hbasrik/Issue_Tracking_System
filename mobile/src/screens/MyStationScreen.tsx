import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, type Station, type Vehicle } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
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

export default function MyStationScreen() {
  const { activeStationId, setActiveStationId } = useAuth();
  const { tokens } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [stations, setStations] = useState<Station[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const active = stations.find((s) => s.ID === activeStationId);

  const loadStations = useCallback(async () => {
    try {
      const res = await api.listStations();
      const items = res.items ?? [];
      setStations(items);
      if (!activeStationId && items.length) {
        setActiveStationId(items[0].ID);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stations');
    }
  }, [activeStationId, setActiveStationId]);

  const loadQueue = useCallback(async () => {
    if (!active?.PhaseNumber) {
      setVehicles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.listVehicles({ phase: active.PhaseNumber });
      setVehicles(res.Items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue');
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    void loadStations();
  }, [loadStations]);

  useFocusEffect(
    useCallback(() => {
      void loadQueue();
    }, [loadQueue]),
  );

  return (
    <Screen>
      <Title>İstasyonum</Title>
      <Subtitle>Aktif istasyondaki araç kuyruğu</Subtitle>

      <FlatList
        horizontal
        data={stations}
        keyExtractor={(s) => String(s.ID)}
        style={{ marginTop: 12, maxHeight: 48 }}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => {
          const selected = item.ID === activeStationId;
          return (
            <Pressable
              onPress={() => setActiveStationId(item.ID)}
              style={{
                marginRight: 8,
                paddingHorizontal: 12,
                minHeight: 44,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? tokens.accent : tokens.border,
                backgroundColor: selected ? tokens.bgSurface2 : tokens.bgSurface1,
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: selected ? tokens.accent : tokens.textSecondary,
                  fontSize: 13,
                  fontWeight: '600',
                }}
              >
                {item.Name}
              </Text>
            </Pressable>
          );
        }}
      />

      {error ? <ErrorText>{error}</ErrorText> : null}
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(v) => v.VIN}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={loadQueue} />
          }
          ListEmptyComponent={
            <Subtitle>No vehicles at this station phase</Subtitle>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('VehiclePhase', { vin: item.VIN })}
            >
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: tokens.textPrimary, fontWeight: '700', fontSize: 18 }}>
                    …{item.VIN.slice(-5)}
                  </Text>
                  <Badge label={`${Math.round(item.TotalProgressPercentage)}%`} color={tokens.accent} />
                </View>
                <Text style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 13 }}>
                  {item.VIN} · {item.CurrentGlobalStatus}
                </Text>
              </Card>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
