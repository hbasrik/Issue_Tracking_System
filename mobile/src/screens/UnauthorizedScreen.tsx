import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';
import { PrimaryButton, Screen, Title, Subtitle } from '../components/ui';

export default function UnauthorizedScreen() {
  const { tokens } = useTheme();
  const { logout } = useAuth();
  const { t } = useI18n();
  return (
    <Screen>
      <View style={styles.center}>
        <Title>{t('auth.noAccessTitle')}</Title>
        <Subtitle>{t('auth.noMobileAccess')}</Subtitle>
        <Text style={{ marginTop: 16, color: tokens.textSecondary, fontSize: 13 }}>
          {t('auth.tryFieldAccount')}
        </Text>
        <View style={{ marginTop: 24 }}>
          <PrimaryButton label={t('common.logout')} onPress={logout} danger />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
});
