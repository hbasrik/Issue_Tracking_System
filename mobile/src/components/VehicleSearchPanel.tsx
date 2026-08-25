import { View } from 'react-native';
import type { Vehicle } from '../api/client';
import { VinSearchBox } from './VinSearchBox';
import { Subtitle } from './ui';

/**
 * VIN-suffix search (former Ara tab). Shared by Home and Vehicles.
 * Typing always notifies the parent (live list filter); tapping a suggestion
 * is an optional extra action (navigate, or pin a VIN).
 */
export function VehicleSearchPanel({
  onSelect,
  onQueryChange,
  onResults,
}: {
  onSelect: (vehicle: Vehicle) => void;
  onQueryChange?: (query: string) => void;
  onResults?: (vehicles: Vehicle[]) => void;
}) {
  return (
    <View>
      <Subtitle>VIN son 5 hane akıllı arama</Subtitle>
      <View style={{ marginTop: 12 }}>
        <VinSearchBox
          onSelect={onSelect}
          onQueryChange={onQueryChange}
          onResults={onResults}
        />
      </View>
    </View>
  );
}
