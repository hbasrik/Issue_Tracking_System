import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Vehicle } from '../api/client';
import { VehicleNumberSearchBox } from './VehicleNumberSearchBox';
import { VinSearchBox } from './VinSearchBox';
import { Subtitle } from './ui';
import { useTheme } from '../theme/ThemeProvider';

type SearchMode = 'vin' | 'number';

const MODES: { value: SearchMode; label: string }[] = [
  { value: 'vin', label: 'VIN' },
  { value: 'number', label: 'Araç No' },
];

/**
 * VIN-suffix / vehicle_number search (former Ara tab). Shared by Home and
 * Vehicles — not a standalone destination.
 */
export function VehicleSearchPanel({
  onSelect,
}: {
  onSelect: (vehicle: Vehicle) => void;
}) {
  const { tokens } = useTheme();
  const [mode, setMode] = useState<SearchMode>('vin');

  return (
    <View>
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

      <View style={{ marginTop: 12 }}>
        {mode === 'vin' ? (
          <VinSearchBox onSelect={onSelect} />
        ) : (
          <VehicleNumberSearchBox onSelect={onSelect} />
        )}
      </View>
    </View>
  );
}
