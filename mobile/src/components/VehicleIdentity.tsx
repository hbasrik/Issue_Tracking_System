import { Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

export function VehicleIdentity({
  vin,
  variant = 'hero',
}: {
  vin: string;
  variant?: 'compact' | 'hero';
}) {
  const { tokens } = useTheme();
  const tail = vin.slice(-5);
  const large = variant === 'hero';
  return (
    <View>
      <Text
        style={{
          color: tokens.accent,
          fontSize: large ? 28 : 16,
          fontWeight: large ? '700' : '600',
          letterSpacing: large ? -0.3 : 0,
        }}
      >
        …{tail}
      </Text>
      <Text
        style={{
          color: tokens.textSecondary,
          fontSize: 13,
          marginTop: space[1] / 2,
        }}
      >
        {vin}
      </Text>
    </View>
  );
}
