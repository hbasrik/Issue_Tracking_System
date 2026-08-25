import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../theme/ThemeProvider';
import { Perm } from '../auth/permissions';
import type { MainDrawerParamList, RootStackParamList } from './types';

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
      screenOptions={{
        headerStyle: { backgroundColor: tokens.bgSurface1 },
        headerTintColor: tokens.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
        drawerStyle: {
          backgroundColor: tokens.bgSurface1,
          width: 280,
        },
        drawerActiveTintColor: tokens.accent,
        drawerInactiveTintColor: tokens.textSecondary,
        drawerActiveBackgroundColor: tokens.bgSurface2,
        drawerLabelStyle: { fontWeight: '600', fontSize: 15 },
      }}
    >
      <Drawer.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Home', drawerLabel: 'Home' }}
      />
      {has(Perm.VehicleView) ? (
        <Drawer.Screen
          name="Vehicles"
          component={VehiclesScreen}
          options={{ title: 'Vehicles', drawerLabel: 'Vehicles' }}
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
        options={{ title: 'Profile', drawerLabel: 'Profile' }}
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
            options={{ title: 'Unauthorized' }}
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
              options={{ title: 'Station Progress' }}
            />
            <Stack.Screen
              name="IssueReport"
              component={IssueReportScreen}
              options={{ title: 'Report Issue' }}
            />
            <Stack.Screen
              name="ManualIssueReport"
              component={ManualIssueReportScreen}
              options={{ title: 'Issue Bildir' }}
            />
            <Stack.Screen
              name="EOLChecklist"
              component={EOLChecklistScreen}
              options={{ title: 'EoL Checklist' }}
            />
            <Stack.Screen
              name="ShipmentChecklist"
              component={ShipmentChecklistScreen}
              options={{ title: 'Shipment Checklist' }}
            />
            <Stack.Screen
              name="TestChecklist"
              component={TestChecklistScreen}
              options={{ title: 'Test Checklist' }}
            />
            <Stack.Screen
              name="IssueDetail"
              component={IssueDetailScreen}
              options={{ title: 'Issue' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
