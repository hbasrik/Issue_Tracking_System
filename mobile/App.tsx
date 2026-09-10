import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthProvider';
import { KeyboardDoneAccessory } from './src/components/keyboard';
import { ConfirmProvider } from './src/components/ConfirmDialog';
import { ApprovalUndoProvider } from './src/components/ApprovalUndoToast';
import { I18nProvider } from './src/i18n';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

if (__DEV__) {
  console.info('[karea] App module evaluated');
}

function AppShell() {
  const { mode } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
      <KeyboardDoneAccessory />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <ThemeProvider>
          <AuthProvider>
            <ConfirmProvider>
              <ApprovalUndoProvider>
                <AppShell />
              </ApprovalUndoProvider>
            </ConfirmProvider>
          </AuthProvider>
        </ThemeProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
