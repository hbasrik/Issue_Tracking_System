import { Pressable, Text, View } from 'react-native';
import {
  CompositeNavigationProp,
  useNavigation,
} from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card } from './ui';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n';
import { useIssueReportQueue } from '../offline/IssueReportQueueProvider';
import type { MainDrawerParamList, RootStackParamList } from '../navigation/types';

type BannerNav = CompositeNavigationProp<
  DrawerNavigationProp<MainDrawerParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

/** Calm pending-count strip — not a blocking alert. */
export function PendingReportsBanner() {
  const { pendingCount } = useIssueReportQueue();
  const { tokens } = useTheme();
  const { t } = useI18n();
  const navigation = useNavigation<BannerNav>();

  if (pendingCount <= 0) return null;

  return (
    <Pressable
      onPress={() => navigation.navigate('PendingReports')}
      accessibilityRole="button"
      accessibilityLabel={t('queue.banner', { n: pendingCount })}
    >
      <Card>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Text style={{ color: tokens.textPrimary, fontSize: 14, flex: 1 }}>
            {pendingCount === 1
              ? t('queue.bannerOne')
              : t('queue.banner', { n: pendingCount })}
          </Text>
          <Text style={{ color: tokens.accent, fontWeight: '600' }}>
            {t('queue.open')}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}
