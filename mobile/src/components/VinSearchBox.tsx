import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, type Vehicle } from '../api/client';
import { useTheme } from '../theme/ThemeProvider';
import { Badge, Card, ErrorText, Subtitle } from './ui';

function vinTail(vin: string): string {
  return vin.slice(-5);
}

/** Shared VIN suffix search + typeahead — design guide §3.1. */
export function VinSearchBox({
  onSelect,
}: {
  onSelect: (v: Vehicle) => void;
}) {
  const { tokens } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (suffix: string) => {
    if (suffix.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchVehicles(suffix.trim());
      setResults(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void search(query);
    }, 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, search]);

  return (
    <View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Son 5 haneyi girin (örn. 00057)"
        placeholderTextColor={tokens.textSecondary}
        autoCapitalize="characters"
        autoCorrect={false}
        style={[
          styles.input,
          {
            backgroundColor: tokens.bgSurface1,
            borderColor: tokens.border,
            color: tokens.textPrimary,
          },
        ]}
      />
      {loading ? (
        <Subtitle>Searching…</Subtitle>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {results.length >= 2 ? (
        <View style={[styles.banner, { backgroundColor: tokens.bgSurface2 }]}>
          <Text style={{ color: tokens.textSecondary, fontSize: 13 }}>
            {results.length} araç eşleşti, doğrusunu seçin
          </Text>
        </View>
      ) : null}
      <FlatList
        data={results}
        keyExtractor={(item) => item.VIN}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable onPress={() => onSelect(item)}>
            <Card>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tail, { color: tokens.textPrimary }]}>
                    {vinTail(item.VIN)}
                  </Text>
                  <Text style={{ color: tokens.textSecondary, fontSize: 13 }}>
                    {item.VIN}
                  </Text>
                </View>
                <Badge label={`Phase ${item.CurrentPhase}`} color={tokens.accent} />
              </View>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 44,
  },
  banner: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tail: { fontSize: 20, fontWeight: '700' },
});
