import {
  DrawerContentScrollView,
  DrawerItemList,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from './Logo';
import { sidebarTokens, space } from '../theme/tokens';

/** Orange drawer chrome + logo plate — matches the web sidebar. */
export function AppDrawer(props: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
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
    </DrawerContentScrollView>
  );
}
