import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, Text, View } from 'react-native';
import type { Vehicle } from '../api/client';
import { VehicleNumberSearchBox } from '../components/VehicleNumberSearchBox';
import { VinSearchBox } from '../components/VinSearchBox';
import { Screen, Subtitle, Title } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { RootStackParamList } from '../navigation/types';

type SearchMode = 'vin' | 'number';

const MODES: { value: SearchMode; label: string }[] = [
  { value: 'vin', label: 'VIN' },
  { value: 'number', label: 'Araç No' },
];

/** Search tab — VIN suffix typeahead (§3.1) or vehicle number lookup (Karar 5). */
export default function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tokens } = useTheme();
  const [mode, setMode] = useState<SearchMode>('vin');

  function openVehicle(v: Vehicle) {
    navigation.navigate('VehicleStation', { vin: v.VIN });
  }

  return (
    <Screen>
      <Title>Ara</Title>
      <Subtitle>
        {mode === 'vin'
          ? 'VIN son 5 hane akıllı arama'
          : 'Araç üzerindeki kısa numara'}
      </Subtitle>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {MODES.map((m) => {
          const selected = mode === m.value;
          return (
            <Pressable
              key={m.value}
              onPress={() => setMode(m.value)}
              style={{
                paddingHorizontal: 16,
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
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: 12, flex: 1 }}>
        {mode === 'vin' ? (
          <VinSearchBox onSelect={openVehicle} />
        ) : (
          <VehicleNumberSearchBox onSelect={openVehicle} />
        )}
      </View>
    </Screen>
  );
}
