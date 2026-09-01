import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Badge, Card, PrimaryButton, Screen, Subtitle, Title } from '../components/ui';
import { useI18n } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { roleDisplayName } from '../lib/roleLabels';
import ChangePasswordScreen from './ChangePasswordScreen';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { tokens, mode, toggle } = useTheme();
  const { t, locale, setLocale } = useI18n();

  return (
    <Screen>
      <Title>{t('profile.title')}</Title>
      <Subtitle>{t('profile.subtitle')}</Subtitle>
      <Card>
        <Text style={{ color: tokens.textPrimary, fontSize: 18, fontWeight: '600' }}>
          {user?.FullName}
        </Text>
        <Text style={{ color: tokens.textSecondary, marginTop: 4 }}>{user?.Email}</Text>
        <View style={{ marginTop: 12 }}>
          <Badge label={roleDisplayName(user?.Role, t)} color={tokens.accent} />
        </View>
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: tokens.textPrimary, fontSize: 15 }}>{t('settings.theme')}</Text>
          <Pressable onPress={toggle} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: tokens.accent, fontWeight: '600' }}>
              {mode === 'dark' ? t('profile.themeToLight') : t('profile.themeToDark')}
            </Text>
          </Pressable>
        </View>
      </Card>
      <Card>
        <Text style={{ color: tokens.textPrimary, fontSize: 15 }}>{t('settings.language')}</Text>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
          <Pressable
            onPress={() => setLocale('tr')}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text
              style={{
                color: locale === 'tr' ? tokens.accent : tokens.textSecondary,
                fontWeight: '600',
              }}
            >
              {t('settings.langTr')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setLocale('en')}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text
              style={{
                color: locale === 'en' ? tokens.accent : tokens.textSecondary,
                fontWeight: '600',
              }}
            >
              {t('settings.langEn')}
            </Text>
          </Pressable>
        </View>
      </Card>
      <ChangePasswordScreen />
      <View style={{ marginTop: 24 }}>
        <PrimaryButton label={t('common.logout')} onPress={logout} danger />
      </View>
    </Screen>
  );
}
