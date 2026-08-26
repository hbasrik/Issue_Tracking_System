import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../theme/ThemeProvider';
import { ErrorText, PrimaryButton, Screen, Subtitle, Title } from '../components/ui';

export default function LoginScreen() {
  const { login } = useAuth();
  const { tokens } = useTheme();
  const [email, setEmail] = useState('operator.one@karea.local');
  const [password, setPassword] = useState('changeme123');
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
      setError(err instanceof ApiError ? err.message : 'Giriş başarısız');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen safe>
      <Pressable style={styles.center} onPress={Keyboard.dismiss} accessible={false}>
        <Title>Karea</Title>
        <Subtitle>Saha girişi</Subtitle>
        <Text style={[styles.label, { color: tokens.textSecondary }]}>E-posta</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          multiline={false}
          numberOfLines={1}
          returnKeyType="next"
          blurOnSubmit={false}
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          style={[
            styles.input,
            {
              color: tokens.textPrimary,
              borderColor: tokens.border,
              backgroundColor: tokens.bgSurface1,
            },
          ]}
        />
        <Text style={[styles.label, { color: tokens.textSecondary }]}>Şifre</Text>
        <TextInput
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          multiline={false}
          numberOfLines={1}
          returnKeyType="go"
          blurOnSubmit
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => {
            Keyboard.dismiss();
            void onSubmit();
          }}
          style={[
            styles.input,
            {
              color: tokens.textPrimary,
              borderColor: tokens.border,
              backgroundColor: tokens.bgSurface1,
            },
          ]}
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <View style={{ marginTop: 20 }}>
          <PrimaryButton label={busy ? 'Giriş yapılıyor…' : 'Giriş yap'} onPress={onSubmit} disabled={busy} />
        </View>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  label: { marginTop: 16, fontSize: 13, fontWeight: '500' },
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
