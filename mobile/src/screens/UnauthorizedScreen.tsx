import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../auth/AuthProvider';
import { PrimaryButton, Screen, Title, Subtitle } from '../components/ui';

export default function UnauthorizedScreen() {
  const { tokens } = useTheme();
  const { logout } = useAuth();
  return (
    <Screen>
      <View style={styles.center}>
        <Title>Unauthorized</Title>
        <Subtitle>
          This mobile app requires the mobile.access permission. Use an
          account that is granted that permission, or open the web dashboard
          if you have web.access.
        </Subtitle>
        <Text style={{ marginTop: 16, color: tokens.textSecondary, fontSize: 13 }}>
          Sign out and try a field account (operator, quality, or assembly).
        </Text>
        <View style={{ marginTop: 24 }}>
          <PrimaryButton label="Log out" onPress={logout} danger />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
});
