import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, type Vehicle } from '../api/client';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n';
import { isTransportError, isAuthError } from '../../../shared/networkError';
import { useReferenceCache } from '../offline/ReferenceCacheProvider';
import { Badge, Card, InfoText, Subtitle, AppTextInput } from './ui';

function vinTail(vin: string): string {
  return vin.slice(-5);
}

/**
 * Shared VIN suffix search + typeahead — design guide §3.1.
 *
 * Online: live typeahead, falling back to the device cache on transport
 * failure. Offline: cache only. Raw fetch errors are never shown.
 *
 * Results render as a plain View/map (not FlatList). Nested
 * VirtualizedList would warn and break scrolling.
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
  const { t } = useI18n();
  const { searchVehicles, snapshot, cacheAgeLabel, ready } = useReferenceCache();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Vehicle[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResultsRef = useRef(onResults);
  onResultsRef.current = onResults;

  const apply = useCallback(
    (items: Vehicle[], fromCache: boolean) => {
      setResults(items);
      onResultsRef.current?.(items);
      if (fromCache && cacheAgeLabel) {
        setHint(cacheAgeLabel);
      } else if (
        items.length === 0 &&
        snapshot.vehicles.length === 0 &&
        ready
      ) {
        setHint(t('offline.noCache'));
      } else {
        setHint(null);
      }
    },
    [cacheAgeLabel, snapshot.vehicles.length, ready, t],
  );

  const search = useCallback(
    async (suffix: string) => {
      if (suffix.trim().length < 2) {
        setResults([]);
        onResultsRef.current?.([]);
        setHint(null);
        return;
      }
      setHint(null);
      setLoading(true);
      try {
        const res = await api.searchVehicles(suffix.trim());
        apply(res.items ?? [], false);
        return;
      } catch (err) {
        if (!isTransportError(err) && !isAuthError(err)) {
          apply([], false);
          setHint(null);
          return;
        }
      } finally {
        setLoading(false);
      }
      apply(searchVehicles(suffix), true);
    },
    [apply, searchVehicles],
  );

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
      <AppTextInput
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          onQueryChange?.(text);
        }}
        placeholder={t('search.placeholder')}
        placeholderTextColor={tokens.textSecondary}
        accessibilityLabel={t('search.aria')}
        autoCapitalize="characters"
        autoCorrect={false}
        multiline={false}
        numberOfLines={1}
        returnKeyType="search"
        blurOnSubmit
        submitBehavior="blurAndSubmit"
        onSubmitEditing={() => {
          Keyboard.dismiss();
        }}
        style={[
          styles.input,
          {
            backgroundColor: tokens.bgSurface1,
            borderColor: tokens.border,
            color: tokens.textPrimary,
          },
        ]}
      />
      {loading ? <Subtitle>{t('common.searching')}</Subtitle> : null}
      {hint ? <InfoText>{hint}</InfoText> : null}
      {results.length >= 2 ? (
        <View style={[styles.banner, { backgroundColor: tokens.bgSurface2 }]}>
          <Text style={{ color: tokens.textSecondary, fontSize: 13 }}>
            {t('search.matches', { n: results.length })}
          </Text>
        </View>
      ) : null}
      <View>
        {results.map((item) => (
          <Pressable
            key={item.VIN}
            onPress={() => {
              Keyboard.dismiss();
              onSelect(item);
            }}
          >
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
