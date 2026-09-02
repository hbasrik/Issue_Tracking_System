import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';
import { BRAND_NAME } from '../../../shared/brand';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Logo';
import { EyeIcon, LockIcon, UserIcon } from '../components/LoginIcons';
import { statusColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { AppTextInput, PrimaryButton, Screen } from '../components/ui';
import { useI18n } from '../i18n';
import { apiErrorMessage } from '../lib/password';

export default function LoginScreen() {
  const { login } = useAuth();
  const { tokens } = useTheme();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forgotHint, setForgotHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    if (__DEV__) console.info('[karea] LoginScreen mounted');
  }, []);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen safe padded={false}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Pressable onPress={Keyboard.dismiss} accessible={false}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: tokens.bgSurface1,
                borderColor: tokens.border,
                shadowColor: tokens.textPrimary,
              },
            ]}
          >
            <View style={styles.brandBlock}>
              <Logo height={52} centered alt={BRAND_NAME} />
              <Text style={[styles.brandName, { color: tokens.textPrimary }]}>
                {BRAND_NAME}
              </Text>
              <Text style={[styles.brandSub, { color: tokens.textSecondary }]}>
                {t('login.productSubtitle')}
              </Text>
            </View>

            <Text style={[styles.welcome, { color: tokens.textPrimary }]}>
              {t('login.welcome')}
            </Text>
            <Text style={[styles.welcomeHint, { color: tokens.textSecondary }]}>
              {t('login.welcomeHint')}
            </Text>

            {error ? (
              <Text style={[styles.error, { color: statusColors.notOk }]}>{error}</Text>
            ) : null}

            <View
              style={[
                styles.fieldRow,
                {
                  borderColor: tokens.border,
                  backgroundColor: tokens.bgPage,
                },
              ]}
            >
              <UserIcon color={tokens.accent} />
              <AppTextInput
                value={email}
                onChangeText={setEmail}
                placeholder={t('login.emailPlaceholder')}
                placeholderTextColor={tokens.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                multiline={false}
                returnKeyType="next"
                blurOnSubmit={false}
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
                style={[styles.fieldInput, { color: tokens.textPrimary }]}
              />
            </View>

            <View
              style={[
                styles.fieldRow,
                {
                  borderColor: tokens.border,
                  backgroundColor: tokens.bgPage,
                },
              ]}
            >
              <LockIcon color={tokens.accent} />
              <AppTextInput
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                placeholder={t('login.passwordPlaceholder')}
                placeholderTextColor={tokens.textSecondary}
                secureTextEntry={!showPassword}
                multiline={false}
                returnKeyType="go"
                blurOnSubmit
                submitBehavior="blurAndSubmit"
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                  void onSubmit();
                }}
                style={[styles.fieldInput, { color: tokens.textPrimary }]}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={8}
                accessibilityLabel={
                  showPassword ? t('login.hidePassword') : t('login.showPassword')
                }
              >
                <EyeIcon color={tokens.accent} off={showPassword} />
              </Pressable>
            </View>

            <Pressable onPress={() => setForgotHint(true)} style={styles.forgotRow}>
              <Text style={[styles.forgotLink, { color: tokens.accent }]}>
                {t('login.forgotPassword')}
              </Text>
            </Pressable>

            {forgotHint ? (
              <Text style={[styles.forgotHint, { color: tokens.textSecondary }]}>
                {t('login.forgotPasswordHint')}
              </Text>
            ) : null}

            <View style={styles.submitWrap}>
              <PrimaryButton
                label={busy ? t('login.submitting') : t('login.submit')}
                onPress={onSubmit}
                disabled={busy}
              />
            </View>

            <Text style={[styles.copyright, { color: tokens.textSecondary }]}>
              {t('login.copyright', { year: 2026, brand: BRAND_NAME })}
            </Text>
          </View>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    paddingVertical: 32,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  brandBlock: {
    alignItems: 'center',
  },
  brandName: {
    marginTop: 14,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  brandSub: {
    marginTop: 4,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  welcome: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
  },
  welcomeHint: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 13,
  },
  error: {
    marginTop: 16,
    textAlign: 'center',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 14,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
  },
  fieldInput: {
    flex: 1,
    marginTop: 0,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 44,
    backgroundColor: 'transparent',
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: 12,
  },
  forgotLink: {
    fontSize: 13,
    fontWeight: '500',
  },
  forgotHint: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  submitWrap: {
    marginTop: 20,
  },
  copyright: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: 11,
    opacity: 0.65,
  },
});
