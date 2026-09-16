import {
  DrawerContentScrollView,
  DrawerItemList,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from './Logo';
import { sidebarTokens, space } from '../theme/tokens';
import { useI18n } from '../i18n';
import { useIssueReportQueue } from '../offline/IssueReportQueueProvider';
import type { RootStackParamList } from '../navigation/types';

/** Orange drawer chrome + logo plate — matches the web sidebar. */
export function AppDrawer(props: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { pendingCount } = useIssueReportQueue();
  return (
    <DrawerContentScrollView
      {...props}
      style={{ backgroundColor: sidebarTokens.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + space[4],
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: Math.max(insets.bottom, space[4]),
      }}
    >
      <View style={{ paddingHorizontal: space[5], paddingBottom: space[5] }}>
        <Logo />
      </View>
      <DrawerItemList {...props} />
      {pendingCount > 0 ? (
        <Pressable
          onPress={() => {
            const parent = props.navigation.getParent<
              NativeStackNavigationProp<RootStackParamList>
            >();
            parent?.navigate('PendingReports');
          }}
          style={{
            marginHorizontal: 8,
            marginTop: space[3],
            minHeight: 44,
            borderRadius: 8,
            paddingHorizontal: 16,
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.20)',
          }}
          accessibilityRole="button"
          accessibilityLabel={t('nav.pendingReports')}
        >
          <Text style={{ color: sidebarTokens.text, fontWeight: '600', fontSize: 15 }}>
            {t('nav.pendingReports')} ({pendingCount})
          </Text>
        </Pressable>
      ) : null}
    </DrawerContentScrollView>
  );
}
