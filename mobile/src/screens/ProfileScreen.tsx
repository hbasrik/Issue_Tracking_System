import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Badge, Card, PrimaryButton, Screen, Subtitle, Title } from '../components/ui';
import { useI18n } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { roleDisplayName } from '../lib/roleLabels';
import ChangePasswordScreen from './ChangePasswordScreen';
import { useReferenceCache } from '../offline/ReferenceCacheProvider';
import { formatCacheAge } from '../offline/referenceCache';
import {
  getCriticalSoundEnabled,
  setCriticalSoundEnabled,
} from '../lib/criticalAlertSound';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { tokens, mode, toggle } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const { snapshot } = useReferenceCache();
  const [soundOn, setSoundOn] = useState(false);
  const cacheLine = snapshot.fetchedAt
    ? t('offline.cacheSummary', {
        n: snapshot.vehicles.length,
        age: formatCacheAge(snapshot.fetchedAt, Date.now(), t),
      })
    : t('offline.cacheEmpty');

  useEffect(() => {
    void getCriticalSoundEnabled().then(setSoundOn);
  }, []);

  async function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    await setCriticalSoundEnabled(next);
  }

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
        <Text style={{ color: tokens.textSecondary, fontSize: 13 }}>{cacheLine}</Text>
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
      <Card>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: tokens.textPrimary, fontSize: 15 }}>
              {t('settings.soundAlerts')}
            </Text>
            <Text style={{ color: tokens.textSecondary, fontSize: 12, marginTop: 4 }}>
              {t('settings.soundAlertsHint')}
            </Text>
          </View>
          <Pressable
            onPress={() => void toggleSound()}
            accessibilityRole="switch"
            accessibilityState={{ checked: soundOn }}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: tokens.accent, fontWeight: '600' }}>
              {soundOn ? t('settings.soundAlertsOn') : t('settings.soundAlertsOff')}
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
