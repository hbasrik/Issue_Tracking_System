import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';
import type { Vehicle } from '../api/client';
import { VinSearchBox } from '../components/VinSearchBox';
import { Screen, Subtitle, Title } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

/** Search tab — VIN suffix typeahead (§3.1). */
export default function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  function openVehicle(v: Vehicle) {
    navigation.navigate('VehiclePhase', { vin: v.VIN });
  }

  return (
    <Screen>
      <Title>Ara</Title>
      <Subtitle>VIN son 5 hane akıllı arama</Subtitle>
      <View style={{ marginTop: 12, flex: 1 }}>
        <VinSearchBox onSelect={openVehicle} />
      </View>
    </Screen>
  );
}
