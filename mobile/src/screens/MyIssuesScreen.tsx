import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, type Issue } from '../api/client';
import {
  Badge,
  Card,
  ErrorText,
  Loading,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

const FILTERS = ['', 'OPEN', 'IN_PROGRESS', 'DONE'] as const;

function severityColor(s: string): string {
  if (s === 'CRITICAL') return statusColors.severityCritical;
  if (s === 'MEDIUM') return statusColors.severityMedium;
  return statusColors.severityLow;
}

function statusColor(s: string): string {
  if (s === 'OPEN') return statusColors.issueOpen;
  if (s === 'IN_PROGRESS') return statusColors.issueInProgress;
  return statusColors.issueResolved;
}

export default function MyIssuesScreen() {
  const { tokens } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [filter, setFilter] = useState<string>('');
  const [items, setItems] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listIssues(filter || undefined);
      setItems(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      <Title>My Issues</Title>
      <Subtitle>Reported or in progress by you</Subtitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {FILTERS.map((f) => {
          const selected = filter === f;
          const label = f || 'ALL';
          return (
            <Pressable
              key={label}
              onPress={() => setFilter(f)}
              style={{
                paddingHorizontal: 12,
                minHeight: 36,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? tokens.accent : tokens.border,
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: selected ? tokens.accent : tokens.textSecondary, fontSize: 12 }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => String(i.ID)}
          ListEmptyComponent={<Subtitle>No issues</Subtitle>}
          renderItem={({ item }) => (
            <Pressable onPress={() => navigation.navigate('IssueDetail', { id: item.ID })}>
              <Card>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <Badge label={item.Status} color={statusColor(item.Status)} />
                  <Badge label={item.Severity} color={severityColor(item.Severity)} />
                </View>
                <Text style={{ color: tokens.textPrimary, fontWeight: '600' }}>
                  …{item.VIN.slice(-5)}
                </Text>
                <Text style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 13 }} numberOfLines={2}>
                  {item.Description}
                </Text>
              </Card>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
