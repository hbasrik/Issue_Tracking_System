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
        <Title>Yetkiniz yok</Title>
        <Subtitle>
          Bu uygulama mobile.access izni gerektirir. Bu izne sahip bir hesap
          kullanın veya web.access varsa web panelini açın.
        </Subtitle>
        <Text style={{ marginTop: 16, color: tokens.textSecondary, fontSize: 13 }}>
          Çıkış yapıp saha hesabıyla deneyin (operator, quality veya assembly).
        </Text>
        <View style={{ marginTop: 24 }}>
          <PrimaryButton label="Çıkış" onPress={logout} danger />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
});
