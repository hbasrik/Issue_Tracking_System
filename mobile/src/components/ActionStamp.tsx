import { Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';
import { formatActionStamp } from '../lib/actionStamp';
import { useI18n } from '../i18n';

/** Quiet actor line under a completed action. Renders nothing when empty. */
export function ActionStamp({
  name,
  at,
  lines,
}: {
  name?: string;
  at?: string | null;
  lines?: string[];
}) {
  const { tokens } = useTheme();
  const { locale } = useI18n();
  const stamp = formatActionStamp(name, at, locale);
  const text = lines ?? (stamp ? [stamp] : []);
  if (text.length === 0) return null;
  return (
    <View style={{ marginTop: space[1] }}>
      {text.map((line) => (
        <Text
          key={line}
          style={{ color: tokens.textSecondary, fontSize: 12, lineHeight: 16 }}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}
