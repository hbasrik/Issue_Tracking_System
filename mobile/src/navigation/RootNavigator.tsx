import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Car, ClipboardList, Home, User } from 'lucide-react-native';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { Perm } from '../auth/permissions';
import type { MainDrawerParamList, RootStackParamList } from './types';
import { AppDrawer } from '../components/AppDrawer';
import { Loading } from '../components/ui';
import { sidebarTokens } from '../theme/tokens';

import LoginScreen from '../screens/LoginScreen';
import UnauthorizedScreen from '../screens/UnauthorizedScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
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

/** Lucide icons — same family/mapping as web AppShell (Home/Car/ClipboardList; User for Profile). */
function MainDrawer() {
  const { tokens } = useTheme();
  const { has } = useAuth();
  const { t } = useI18n();
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
        options={() => ({
          title: t('nav.home'),
          drawerLabel: t('nav.home'),
          drawerIcon: ({ color, size }) => <Home color={color} size={size} />,
        })}
      />
      {has(Perm.VehicleView) ? (
        <Drawer.Screen
          name="Vehicles"
          component={VehiclesScreen}
          options={() => ({
            title: t('nav.vehicles'),
            drawerLabel: t('nav.vehicles'),
            drawerIcon: ({ color, size }) => <Car color={color} size={size} />,
          })}
        />
      ) : null}
      {has(Perm.IssueView) ? (
        <Drawer.Screen
          name="MyIssues"
          component={MyIssuesScreen}
          options={() => ({
            title: t('nav.issues'),
            drawerLabel: t('nav.issues'),
            drawerIcon: ({ color, size }) => (
              <ClipboardList color={color} size={size} />
            ),
          })}
        />
      ) : null}
      <Drawer.Screen
        name="Profile"
        component={ProfileScreen}
        options={() => ({
          title: t('nav.profile'),
          drawerLabel: t('nav.profile'),
          drawerIcon: ({ color, size }) => <User color={color} size={size} />,
        })}
      />
    </Drawer.Navigator>
  );
}

export function RootNavigator() {
  const { isAuthenticated, has, user, ready } = useAuth();
  const { mode, tokens } = useTheme();
  const { t } = useI18n();

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

  if (!ready) {
    return <Loading />;
  }

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
        ) : user?.MustChangePassword ? (
          <Stack.Screen
            name="ChangePassword"
            options={{ headerShown: false, gestureEnabled: false }}
          >
            {() => <ChangePasswordScreen forced />}
          </Stack.Screen>
        ) : !has(Perm.MobileAccess) ? (
          <Stack.Screen
            name="Unauthorized"
            component={UnauthorizedScreen}
            options={() => ({ title: t('nav.unauthorized') })}
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
              options={() => ({ title: t('nav.stationProgress') })}
            />
            <Stack.Screen
              name="IssueReport"
              component={IssueReportScreen}
              options={() => ({ title: t('nav.reportIssue') })}
            />
            <Stack.Screen
              name="ManualIssueReport"
              component={ManualIssueReportScreen}
              options={() => ({ title: t('nav.reportIssue') })}
            />
            <Stack.Screen
              name="EOLChecklist"
              component={EOLChecklistScreen}
              options={() => ({ title: t('nav.eolChecklist') })}
            />
            <Stack.Screen
              name="ShipmentChecklist"
              component={ShipmentChecklistScreen}
              options={() => ({ title: t('nav.shipmentChecklist') })}
            />
            <Stack.Screen
              name="TestChecklist"
              component={TestChecklistScreen}
              options={() => ({ title: t('nav.testChecklist') })}
            />
            <Stack.Screen
              name="IssueDetail"
              component={IssueDetailScreen}
              options={() => ({ title: t('nav.issueDetail') })}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
