import { View } from 'react-native';
import type { Vehicle } from '../api/client';
import { VinSearchBox } from './VinSearchBox';
import { Subtitle } from './ui';

/**
 * VIN-suffix search (former Ara tab). Shared by Home and Vehicles — not a
 * standalone destination.
 */
export function VehicleSearchPanel({
  onSelect,
}: {
  onSelect: (vehicle: Vehicle) => void;
}) {
  return (
    <View>
      <Subtitle>VIN son 5 hane akıllı arama</Subtitle>
      <View style={{ marginTop: 12 }}>
        <VinSearchBox onSelect={onSelect} />
      </View>
    </View>
  );
}
