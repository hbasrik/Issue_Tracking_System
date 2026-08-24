import { useCallback, useEffect, useRef, useState } from 'react';
import {
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

/**
 * Shared VIN suffix search + typeahead — design guide §3.1.
 *
 * Results render as a plain View/map (not FlatList). The API caps typeahead
 * at a handful of rows, and this box is always embedded in a parent
 * ScrollView/FlatList (Home, Vehicles, My Issues, Manual Issue modal) —
 * a nested VirtualizedList would warn and break scrolling.
 */
export function VinSearchBox({
  onSelect,
  onQueryChange,
  onResults,
}: {
  onSelect: (v: Vehicle) => void;
  /** Fires on every keystroke so a parent list can filter live. */
  onQueryChange?: (query: string) => void;
  /** Typeahead matches — used by parents that pin a selected vehicle. */
  onResults?: (vehicles: Vehicle[]) => void;
}) {
  const { tokens } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResultsRef = useRef(onResults);
  onResultsRef.current = onResults;

  const search = useCallback(async (suffix: string) => {
    if (suffix.trim().length < 2) {
      setResults([]);
      onResultsRef.current?.([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchVehicles(suffix.trim());
      const items = res.items ?? [];
      setResults(items);
      onResultsRef.current?.(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
      onResultsRef.current?.([]);
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
        onChangeText={(text) => {
          setQuery(text);
          onQueryChange?.(text);
        }}
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
      <View>
        {results.map((item) => (
          <Pressable key={item.VIN} onPress={() => onSelect(item)}>
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
                <Badge
                  label={`${Math.round(item.TotalProgressPercentage)}%`}
                  color={tokens.accent}
                />
              </View>
            </Card>
          </Pressable>
        ))}
      </View>
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
