import {
  DrawerContentScrollView,
  DrawerItemList,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { View } from 'react-native';
import { Logo } from './Logo';
import { sidebarTokens, space } from '../theme/tokens';

/** Orange drawer chrome + logo plate — matches the web sidebar. */
export function AppDrawer(props: DrawerContentComponentProps) {
  return (
    <DrawerContentScrollView
      {...props}
      style={{ backgroundColor: sidebarTokens.bg }}
      contentContainerStyle={{ paddingTop: space[4] }}
    >
      <View style={{ paddingHorizontal: space[5], paddingBottom: space[5] }}>
        <Logo />
      </View>
      <DrawerItemList {...props} />
    </DrawerContentScrollView>
  );
}
