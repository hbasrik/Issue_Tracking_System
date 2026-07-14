import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Screen, Title, Subtitle } from '../components/ui';

export default function UnauthorizedScreen() {
  const { tokens } = useTheme();
  return (
    <Screen>
      <View style={styles.center}>
        <Title>Unauthorized</Title>
        <Subtitle>
          This mobile app is for OPERATOR accounts only. Manager/Admin users should use
          the web dashboard.
        </Subtitle>
        <Text style={{ marginTop: 16, color: tokens.textSecondary, fontSize: 13 }}>
          Sign out from Profile (if reachable) or restart the app with an operator account.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
});
