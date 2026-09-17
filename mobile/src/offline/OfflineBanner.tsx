import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { useAppOnline } from './connectivity';

/** In-flow notice at the top so it never covers a save/send control. */
export function OfflineBanner() {
  const online = useAppOnline();
  const { t } = useI18n();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  if (online) return null;

  return (
    <View
      style={{
        paddingTop: Math.max(insets.top, 8),
        paddingBottom: 10,
        paddingHorizontal: 12,
        backgroundColor: tokens.bgSurface1,
        borderBottomWidth: 1,
        borderBottomColor: tokens.border,
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
