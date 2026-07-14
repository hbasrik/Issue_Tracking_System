import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, Text, View } from 'react-native';
import type { Vehicle } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { VinSearchBox } from '../components/VinSearchBox';
import { Screen, Subtitle, Title } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { RootStackParamList } from '../navigation/types';

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { tokens, toggle, mode } = useTheme();

  function openVehicle(v: Vehicle) {
    navigation.navigate('VehiclePhase', { vin: v.VIN });
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Title>Karea</Title>
          <Subtitle>{user?.FullName ?? 'Operator'}</Subtitle>
        </View>
        <Pressable onPress={toggle} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: tokens.accent, fontSize: 13, fontWeight: '600' }}>
            {mode === 'dark' ? 'Light' : 'Dark'}
          </Text>
        </Pressable>
      </View>
      <View style={{ marginTop: 20, flex: 1 }}>
        <Subtitle>Quick VIN search</Subtitle>
        <View style={{ marginTop: 8, flex: 1 }}>
          <VinSearchBox onSelect={openVehicle} />
        </View>
      </View>
    </Screen>
  );
}
