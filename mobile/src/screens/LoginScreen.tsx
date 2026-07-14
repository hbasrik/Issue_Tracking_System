import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../theme/ThemeProvider';
import { ErrorText, PrimaryButton, Screen, Subtitle, Title } from '../components/ui';

export default function LoginScreen() {
  const { login } = useAuth();
  const { tokens } = useTheme();
  const [email, setEmail] = useState('operator1@karea.local');
  const [password, setPassword] = useState('changeme123');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.center}>
        <Title>Karea</Title>
        <Subtitle>Operator field sign-in</Subtitle>
        <Text style={[styles.label, { color: tokens.textSecondary }]}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[
            styles.input,
            {
              color: tokens.textPrimary,
              borderColor: tokens.border,
              backgroundColor: tokens.bgSurface1,
            },
          ]}
        />
        <Text style={[styles.label, { color: tokens.textSecondary }]}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
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
          <PrimaryButton label={busy ? 'Signing in…' : 'Sign in'} onPress={onSubmit} disabled={busy} />
        </View>
      </View>
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
