import { Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

export function VehicleIdentity({
  vin,
  variant = 'hero',
  onPress,
  linkLabel,
}: {
  vin: string;
  variant?: 'compact' | 'hero';
  /** Makes the identity a link (e.g. issue detail → vehicle detail). */
  onPress?: () => void;
  linkLabel?: string;
}) {
  const { tokens } = useTheme();
  const tail = vin.slice(-5);
  const large = variant === 'hero';
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Text
          style={{
            color: tokens.accent,
            fontSize: large ? 28 : 16,
            fontWeight: large ? '700' : '600',
            letterSpacing: large ? -0.3 : 0,
            textDecorationLine: onPress ? 'underline' : 'none',
            textDecorationColor: tokens.accent,
          }}
        >
          …{tail}
        </Text>
        {onPress ? (
          <ChevronRight size={large ? 26 : 18} color={tokens.accent} strokeWidth={2.4} />
        ) : null}
      </View>
      <Text
        style={{
          color: tokens.textSecondary,
          fontSize: 13,
          marginTop: space[1] / 2,
        }}
      >
        {vin}
      </Text>
    </>
  );
  if (!onPress) return <View>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={linkLabel ? `${linkLabel}: ${vin}` : vin}
      testID="issue-vehicle-link"
      hitSlop={8}
      style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}
    >
      {body}
    </Pressable>
  );
}
