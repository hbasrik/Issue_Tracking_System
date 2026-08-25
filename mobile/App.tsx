import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthProvider';
import { KeyboardDoneAccessory } from './src/components/keyboard';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

if (__DEV__) {
  console.info('[karea] App module evaluated');
}

function AppShell() {
  const { mode } = useTheme();
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <KeyboardDoneAccessory />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
