import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { useAppOnline } from './connectivity';

/** Global calm notice. Does not block taps on the screen beneath. */
export function OfflineBanner() {
  const online = useAppOnline();
  const { t } = useI18n();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  if (online) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: Math.max(insets.bottom, 8) + 8,
        backgroundColor: tokens.bgSurface1,
        borderColor: tokens.border,
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}
    >
      <Text
        style={{
          color: tokens.textPrimary,
          fontSize: 13,
          fontWeight: '600',
          textAlign: 'center',
        }}
      >
        {t('offline.banner')}
      </Text>
    </View>
  );
}
