import { Text } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../theme/ThemeProvider';
import type { MainTabParamList, RootStackParamList } from './types';

import LoginScreen from '../screens/LoginScreen';
import UnauthorizedScreen from '../screens/UnauthorizedScreen';
import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import MyStationScreen from '../screens/MyStationScreen';
import DurumScreen from '../screens/DurumScreen';
import MyIssuesScreen from '../screens/MyIssuesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import VehiclePhaseScreen from '../screens/VehiclePhaseScreen';
import IssueReportScreen from '../screens/IssueReportScreen';
import EOLChecklistScreen from '../screens/EOLChecklistScreen';
import ShipmentChecklistScreen from '../screens/ShipmentChecklistScreen';
import IssueDetailScreen from '../screens/IssueDetailScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function TabLabel({ label, color }: { label: string; color: string }) {
  return <Text style={{ fontSize: 11, color, fontWeight: '600' }}>{label}</Text>;
}

function MainTabs() {
  const { tokens } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: tokens.bgSurface1,
          borderTopColor: tokens.border,
        },
        tabBarActiveTintColor: tokens.accent,
        tabBarInactiveTintColor: tokens.textSecondary,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label="Home" color={color} />,
        }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label="Ara" color={color} />,
        }}
      />
      <Tab.Screen
        name="Durum"
        component={DurumScreen}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label="Durum" color={color} />,
        }}
      />
      <Tab.Screen
        name="MyStation"
        component={MyStationScreen}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label="İstasyon" color={color} />,
        }}
      />
      <Tab.Screen
        name="MyIssues"
        component={MyIssuesScreen}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label="Issues" color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label="Profil" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { isAuthenticated, isOperator } = useAuth();
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
        ) : !isOperator ? (
          <Stack.Screen
            name="Unauthorized"
            component={UnauthorizedScreen}
            options={{ title: 'Unauthorized' }}
          />
        ) : (
          <>
            <Stack.Screen
              name="MainTabs"
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="VehiclePhase"
              component={VehiclePhaseScreen}
              options={{ title: 'Phase Progress' }}
            />
            <Stack.Screen
              name="IssueReport"
              component={IssueReportScreen}
              options={{ title: 'Report Issue' }}
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
