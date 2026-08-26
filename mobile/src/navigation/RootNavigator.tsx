import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../theme/ThemeProvider';
import { Perm } from '../auth/permissions';
import type { MainDrawerParamList, RootStackParamList } from './types';
import { AppDrawer } from '../components/AppDrawer';
import { sidebarTokens } from '../theme/tokens';

import LoginScreen from '../screens/LoginScreen';
import UnauthorizedScreen from '../screens/UnauthorizedScreen';
import HomeScreen from '../screens/HomeScreen';
import VehiclesScreen from '../screens/VehiclesScreen';
import MyIssuesScreen from '../screens/MyIssuesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import VehicleStationScreen from '../screens/VehicleStationScreen';
import IssueReportScreen from '../screens/IssueReportScreen';
import ManualIssueReportScreen from '../screens/ManualIssueReportScreen';
import EOLChecklistScreen from '../screens/EOLChecklistScreen';
import ShipmentChecklistScreen from '../screens/ShipmentChecklistScreen';
import TestChecklistScreen from '../screens/TestChecklistScreen';
import IssueDetailScreen from '../screens/IssueDetailScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Drawer = createDrawerNavigator<MainDrawerParamList>();

function MainDrawer() {
  const { tokens } = useTheme();
  const { has } = useAuth();
  return (
    <Drawer.Navigator
      drawerContent={(props) => <AppDrawer {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: tokens.bgSurface1 },
        headerTintColor: tokens.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
        drawerStyle: {
          backgroundColor: sidebarTokens.bg,
          width: 280,
        },
        drawerActiveTintColor: sidebarTokens.text,
        drawerInactiveTintColor: 'rgba(255,255,255,0.88)',
        drawerActiveBackgroundColor: 'rgba(255,255,255,0.20)',
        drawerInactiveBackgroundColor: 'transparent',
        drawerLabelStyle: { fontWeight: '600', fontSize: 15 },
        drawerItemStyle: { borderRadius: 8, marginHorizontal: 8 },
      }}
    >
      <Drawer.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Ana sayfa', drawerLabel: 'Ana sayfa' }}
      />
      {has(Perm.VehicleView) ? (
        <Drawer.Screen
          name="Vehicles"
          component={VehiclesScreen}
          options={{ title: 'Araçlar', drawerLabel: 'Araçlar' }}
        />
      ) : null}
      {has(Perm.IssueView) ? (
        <Drawer.Screen
          name="MyIssues"
          component={MyIssuesScreen}
          options={{ title: 'Issues', drawerLabel: 'Issues' }}
        />
      ) : null}
      <Drawer.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profil', drawerLabel: 'Profil' }}
      />
    </Drawer.Navigator>
  );
}

export function RootNavigator() {
  const { isAuthenticated, has } = useAuth();
  const { mode, tokens } = useTheme();

  const navTheme = {
    ...(mode === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(mode === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: tokens.bgPage,
      card: tokens.bgSurface1,
      text: tokens.textPrimary,
      border: tokens.border,
      primary: tokens.accent,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: tokens.bgSurface1 },
          headerTintColor: tokens.textPrimary,
          contentStyle: { backgroundColor: tokens.bgPage },
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : !has(Perm.MobileAccess) ? (
          <Stack.Screen
            name="Unauthorized"
            component={UnauthorizedScreen}
            options={{ title: 'Yetkisiz' }}
          />
        ) : (
          <>
            <Stack.Screen
              name="MainDrawer"
              component={MainDrawer}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="VehicleStation"
              component={VehicleStationScreen}
              options={{ title: 'İstasyon ilerlemesi' }}
            />
            <Stack.Screen
              name="IssueReport"
              component={IssueReportScreen}
              options={{ title: 'Issue Bildir' }}
            />
            <Stack.Screen
              name="ManualIssueReport"
              component={ManualIssueReportScreen}
              options={{ title: 'Issue Bildir' }}
            />
            <Stack.Screen
              name="EOLChecklist"
              component={EOLChecklistScreen}
              options={{ title: 'EoL Kontrolü' }}
            />
            <Stack.Screen
              name="ShipmentChecklist"
              component={ShipmentChecklistScreen}
              options={{ title: 'Sevk öncesi kontrol' }}
            />
            <Stack.Screen
              name="TestChecklist"
              component={TestChecklistScreen}
              options={{ title: 'Test Kontrolü' }}
            />
            <Stack.Screen
              name="IssueDetail"
              component={IssueDetailScreen}
              options={{ title: 'Issue Detayı' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
