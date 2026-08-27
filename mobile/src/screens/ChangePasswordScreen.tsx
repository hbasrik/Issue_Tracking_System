import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import {
  AppTextInput,
  ErrorText,
  OutlineButton,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import { PASSWORD_RULE_HINT, passwordErrorMessage } from '../lib/password';
import { useTheme } from '../theme/ThemeProvider';

export default function ChangePasswordScreen({
  forced = false,
}: {
  forced?: boolean;
}) {
  const { markPasswordChanged, logout } = useAuth();
  const { tokens } = useTheme();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    Keyboard.dismiss();
    setError(null);
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError('Yeni şifre ve tekrarı eşleşmiyor.');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (forced) {
        markPasswordChanged();
      } else {
        setSaved(true);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? passwordErrorMessage(err) : 'Şifre değiştirilemedi',
      );
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [
    styles.input,
    {
      color: tokens.textPrimary,
      borderColor: tokens.border,
      backgroundColor: tokens.bgSurface1,
    },
  ];

  const body = (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={forced ? styles.forcedPad : undefined}
      >
        <Pressable onPress={Keyboard.dismiss} accessible={false}>
          <Title>{forced ? 'Şifrenizi değiştirin' : 'Şifre'}</Title>
          <Subtitle>
            {forced
              ? 'İlk girişte veya yönetici sıfırlamasından sonra yeni bir şifre belirlemeniz gerekir.'
              : 'Mevcut şifrenizi doğrulayıp yeni şifre belirleyin.'}
          </Subtitle>
          <Text style={[styles.hint, { color: tokens.textSecondary }]}>
            {PASSWORD_RULE_HINT}
          </Text>
          <Text style={[styles.label, { color: tokens.textSecondary }]}>
            Mevcut şifre
          </Text>
          <AppTextInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            autoComplete="password"
            style={inputStyle}
          />
          <Text style={[styles.label, { color: tokens.textSecondary }]}>
            Yeni şifre
          </Text>
          <AppTextInput
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoComplete="password-new"
            style={inputStyle}
          />
          <Text style={[styles.label, { color: tokens.textSecondary }]}>
            Yeni şifre (tekrar)
          </Text>
          <AppTextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="password-new"
            style={inputStyle}
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          {saved ? (
            <Text style={[styles.saved, { color: tokens.accent }]}>
              Şifre güncellendi.
            </Text>
          ) : null}
          <View style={{ marginTop: 20 }}>
            <PrimaryButton
              label={busy ? 'Kaydediliyor…' : 'Şifreyi değiştir'}
              onPress={() => void onSubmit()}
              disabled={busy}
            />
          </View>
          {forced ? (
            <View style={{ marginTop: 12 }}>
              <OutlineButton label="Çıkış" onPress={logout} />
            </View>
          ) : null}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (forced) {
    return <Screen safe padded={false}>{body}</Screen>;
  }
  return body;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  forcedPad: { padding: 16, flexGrow: 1, justifyContent: 'center' },
  hint: { marginTop: 12, fontSize: 13, fontWeight: '500' },
  label: { marginTop: 16, fontSize: 13, fontWeight: '500' },
  saved: { marginTop: 8, fontSize: 13, fontWeight: '500' },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 44,
  },
});
