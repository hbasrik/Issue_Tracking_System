import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Badge, Card, PrimaryButton, Screen, Subtitle, Title } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { tokens, mode, toggle } = useTheme();

  return (
    <Screen>
      <Title>Profil</Title>
      <Subtitle>Rol, tema ve çıkış</Subtitle>
      <Card>
        <Text style={{ color: tokens.textPrimary, fontSize: 18, fontWeight: '600' }}>
          {user?.FullName}
        </Text>
        <Text style={{ color: tokens.textSecondary, marginTop: 4 }}>{user?.Email}</Text>
        <View style={{ marginTop: 12 }}>
          <Badge label={user?.Role ?? ''} color={tokens.accent} />
        </View>
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: tokens.textPrimary, fontSize: 15 }}>Theme</Text>
          <Pressable onPress={toggle} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: tokens.accent, fontWeight: '600' }}>
              {mode === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
            </Text>
          </Pressable>
        </View>
      </Card>
      <View style={{ marginTop: 24 }}>
        <PrimaryButton label="Log out" onPress={logout} danger />
      </View>
    </Screen>
  );
}
